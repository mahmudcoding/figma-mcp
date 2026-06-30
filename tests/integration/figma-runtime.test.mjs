import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const serverDir = path.join(rootDir, "mcp-server");
const reportDir = path.join(rootDir, "coverage");
const reportJsonPath = path.join(reportDir, "figma-mcp-runtime-report.json");
const reportMdPath = path.join(reportDir, "figma-mcp-runtime-report.md");

const runId = `mcp-runtime-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
const pluginAuthToken = process.env.FIGMA_TEST_PLUGIN_AUTH_TOKEN ?? `figma-mcp-runtime-${crypto.randomUUID()}`;
const pluginTimeoutMs = Number(process.env.FIGMA_TEST_PLUGIN_TIMEOUT_MS ?? 120_000);
const allowSkipWithoutPlugin = process.env.FIGMA_RUNTIME_ALLOW_SKIP === "1";
const requireFileNamePattern = process.env.FIGMA_TEST_FILE_NAME_PATTERN
  ? new RegExp(process.env.FIGMA_TEST_FILE_NAME_PATTERN)
  : undefined;
const allowAnyFile = process.env.FIGMA_TEST_ALLOW_ANY_FILE === "1";
const expectedEditor = process.env.FIGMA_TEST_EDITOR;

const report = {
  runId,
  generatedAt: new Date().toISOString(),
  sources: {
    schema: "docs/generated/completeness-audit.json",
    runtime: "MCP stdio server + live Figma plugin WebSocket"
  },
  environment: {
    node: process.version,
    platform: process.platform,
    pluginTimeoutMs,
    expectedEditor: expectedEditor ?? null,
    requireFileNamePattern: process.env.FIGMA_TEST_FILE_NAME_PATTERN ?? null,
    allowAnyFile
  },
  summary: {
    schemaCoveragePercent: 0,
    runtimeTestedPercent: 0,
    runtimePassPercent: 0,
    totalRuntimeChecks: 0,
    executedRuntimeChecks: 0,
    passedRuntimeChecks: 0,
    failedRuntimeChecks: 0,
    unsupportedRuntimeChecks: 0
  },
  figma: {
    fileName: null,
    editorType: null,
    originalPageId: null,
    temporaryPageId: null,
    temporaryPageName: null
  },
  flakyTools: [],
  unsupportedToolsByEditor: {},
  unsupportedByEnvironment: [],
  checks: []
};

let client;
let transport;
let port;
let host;
let testPageId;
let originalPageId;
let schemaAudit;
let shared = {};

test("Figma MCP runtime integration suite", { timeout: Math.max(pluginTimeoutMs + 120_000, 240_000) }, async (t) => {
  schemaAudit = JSON.parse(await fs.readFile(path.join(rootDir, "docs/generated/completeness-audit.json"), "utf8"));
  report.summary.schemaCoveragePercent = schemaAudit.coverage.overallCoveragePercent;
  let runtimeUnavailable = false;

  await t.test("preflight: start MCP server and connect plugin", async () => {
    await startMcpClient();
    let documentResult;
    try {
      documentResult = await waitForPluginDocument();
    } catch (error) {
      if (allowSkipWithoutPlugin && isUnsupported(error)) {
        runtimeUnavailable = true;
        report.unsupportedByEnvironment.push({
          tool: "figma.get_document",
          name: "preflight plugin connection",
          message: error.message
        });
        return;
      }
      throw error;
    }
    const document = documentResult.result;

    report.figma.fileName = document.name ?? null;
    report.figma.editorType = document.editorType ?? null;

    if (expectedEditor) {
      assert.equal(document.editorType, expectedEditor, `Expected editor ${expectedEditor}, got ${document.editorType}`);
    }

    if (requireFileNamePattern && !requireFileNamePattern.test(document.name ?? "")) {
      assert.fail(`Connected file "${document.name}" does not match FIGMA_TEST_FILE_NAME_PATTERN`);
    }

    if (!allowAnyFile && !requireFileNamePattern) {
      const looksLikeTestFile = /test|temporary|temp|sandbox|mcp|codex/i.test(document.name ?? "");
      assert.ok(
        looksLikeTestFile,
        [
          `Refusing to run destructive integration tests in "${document.name}".`,
          "Open a temporary Figma file or set FIGMA_TEST_ALLOW_ANY_FILE=1 explicitly."
        ].join(" ")
      );
    }

    originalPageId = document.currentPageId;
    report.figma.originalPageId = originalPageId;
  });

  if (runtimeUnavailable) {
    t.skip("Live Figma plugin is unavailable and FIGMA_RUNTIME_ALLOW_SKIP=1 is set");
    return;
  }

  await t.test("document operations: create isolated temporary page", async () => {
    await runCheck("document operations", "create temporary page with real Plugin API", "figma.call_api", async () => {
      const created = await callTool("figma.call_api", {
        target: "figma",
        method: "createPage",
        args: []
      });
      testPageId = created.result.id;
      report.figma.temporaryPageId = testPageId;
      report.figma.temporaryPageName = runId;

      await callTool("figma.set_property", {
        target: "page",
        pageId: testPageId,
        property: "name",
        value: runId
      });
      await callTool("figma.call_api", {
        target: "figma",
        method: "setCurrentPageAsync",
        args: [{ $pageId: testPageId }]
      });

      const current = await callTool("figma.get_current_page", {});
      assert.equal(current.currentPage.id, testPageId);
      assert.equal(current.currentPage.name, runId);
    });
  });

  await t.test("runtime categories", async (t) => {
    await t.test("document operations", () =>
      runCheck("document operations", "get document/current page snapshots", "figma.get_document", async () => {
        const before = await snapshotCurrentPage();
        const document = await callTool("figma.get_document", {});
        const current = await callTool("figma.get_current_page", {});
        assert.ok(document.pages.some((page) => page.id === testPageId));
        assert.equal(current.currentPage.id, testPageId);
        const after = await snapshotCurrentPage();
        assert.equal(after.hash, before.hash);
      }));

    await t.test("create operations", async () => {
      await runCheck("create operations", "create frame, rectangle, text, component, autolayout, ellipse", "figma.create_frame", async () => {
        const frame = await callTool("figma.create_frame", {
          pageId: testPageId,
          name: `${runId}/frame`,
          x: 100,
          y: 100,
          width: 360,
          height: 240
        });
        shared.frameId = frame.node.id;

        const rectangle = await callTool("figma.create_rectangle", {
          pageId: testPageId,
          name: `${runId}/rectangle`,
          x: 120,
          y: 130,
          width: 120,
          height: 80
        });
        shared.rectangleId = rectangle.node.id;

        const text = await callTool("figma.create_text", {
          pageId: testPageId,
          name: `${runId}/text`,
          characters: "Runtime MCP",
          fontFamily: "Inter",
          fontStyle: "Regular",
          fontSize: 24,
          x: 120,
          y: 240
        });
        shared.textId = text.node.id;

        const component = await callTool("figma.create_component", {
          pageId: testPageId,
          name: `${runId}/component`,
          x: 520,
          y: 120,
          width: 180,
          height: 80
        });
        shared.componentId = component.node.id;

        const autoLayout = await callTool("figma.create_autolayout", {
          pageId: testPageId,
          name: `${runId}/autolayout`,
          x: 760,
          y: 120,
          width: 320,
          height: 180,
          layout: {
            layoutMode: "VERTICAL",
            primaryAxisSizingMode: "FIXED",
            counterAxisSizingMode: "FIXED",
            itemSpacing: 12,
            paddingTop: 16,
            paddingRight: 16,
            paddingBottom: 16,
            paddingLeft: 16
          }
        });
        shared.autoLayoutId = autoLayout.node.id;

        const ellipse = await callTool("figma.create_node", {
          pageId: testPageId,
          createMethod: "createEllipse",
          properties: {
            name: `${runId}/ellipse`,
            x: 1120,
            y: 120,
            width: 90,
            height: 90
          }
        });
        shared.ellipseId = ellipse.node.id;

        for (const nodeId of [shared.frameId, shared.rectangleId, shared.textId, shared.componentId, shared.autoLayoutId, shared.ellipseId]) {
          const node = await callTool("figma.get_node", { nodeId });
          assert.ok(node.node.id);
        }
      });
    });

    await t.test("selection and event subscriptions", async () => {
      await runCheck("event subscriptions", "selectionchange subscription emits queued event", "figma.subscribe_event", async () => {
        const subscription = await callTool("figma.subscribe_event", {
          eventType: "selectionchange",
          target: "figma"
        });
        await callTool("figma.set_property", {
          target: "currentPage",
          property: "selection",
          value: [{ $nodeId: shared.rectangleId }]
        });
        await wait(250);
        const events = await callTool("figma.poll_events", {
          eventType: "selectionchange",
          sinceSequence: 0,
          limit: 20
        });
        assert.ok(events.events.some((event) => event.subscriptionId === subscription.subscriptionId));
        await callTool("figma.unsubscribe_event", {
          subscriptionId: subscription.subscriptionId
        });
      });

      await runCheck("selection", "set and read current selection", "figma.get_selection", async () => {
        await callTool("figma.set_property", {
          target: "currentPage",
          property: "selection",
          value: [{ $nodeId: shared.textId }]
        });
        const selection = await callTool("figma.get_selection", {});
        assert.deepEqual(selection.selection.map((node) => node.id), [shared.textId]);
      });
    });

    await t.test("node traversal", () =>
      runCheck("node traversal", "find nodes and inspect node", "figma.find_nodes", async () => {
        const found = await callTool("figma.find_nodes", {
          nameContains: `${runId}/`,
          pageId: testPageId,
          includeChildren: true,
          maxResults: 50
        });
        assert.ok(found.count >= 6);
        assert.ok(found.nodes.some((node) => node.id === shared.rectangleId));
        const node = await callTool("figma.get_node", { nodeId: shared.rectangleId });
        assert.equal(node.node.type, "RECTANGLE");
      }));

    await t.test("node mutations", async () => {
      await runCheck("node mutations", "update, move, resize, duplicate, delete", "figma.update_node", async () => {
        await callTool("figma.update_node", {
          nodeId: shared.rectangleId,
          name: `${runId}/rectangle-mutated`,
          bounds: { x: 180, y: 180, width: 180, height: 110 }
        });
        await callTool("figma.move_node", {
          nodeId: shared.rectangleId,
          x: 200,
          y: 210
        });
        await callTool("figma.resize_node", {
          nodeId: shared.rectangleId,
          width: 200,
          height: 120
        });
        const duplicate = await callTool("figma.duplicate_node", {
          nodeId: shared.rectangleId,
          offsetX: 32,
          offsetY: 32
        });
        shared.duplicateRectangleId = duplicate.node.id;
        await callTool("figma.delete_node", { nodeId: shared.duplicateRectangleId });

        const node = await callTool("figma.get_node", { nodeId: shared.rectangleId });
        assert.equal(node.node.name, `${runId}/rectangle-mutated`);
        assert.equal(node.node.width, 200);
        assert.equal(node.node.height, 120);

        await expectToolError("figma.get_node", { nodeId: shared.duplicateRectangleId }, "NODE_NOT_FOUND");
      });
    });

    await t.test("text editing and font edge cases", async () => {
      await runCheck("text editing", "edit text content and font", "figma.update_node", async () => {
        await callTool("figma.update_node", {
          nodeId: shared.textId,
          characters: "Runtime MCP edited",
          fontFamily: "Inter",
          fontStyle: "Regular",
          fontSize: 32
        });
        const text = await callTool("figma.get_node", { nodeId: shared.textId });
        assert.equal(text.node.characters, "Runtime MCP edited");
      });

      await runCheck("text editing", "font loading failure path", "figma.create_text", async () => {
        await expectToolError("figma.create_text", {
          pageId: testPageId,
          name: `${runId}/missing-font`,
          characters: "Should fail",
          fontFamily: `Missing Font ${crypto.randomUUID()}`,
          fontStyle: "Regular"
        });
      });
    });

    await t.test("styling", () =>
      runCheck("styling", "apply fills, strokes, effects, opacity", "figma.update_node", async () => {
        await callTool("figma.update_node", {
          nodeId: shared.rectangleId,
          style: {
            fills: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.8 } }],
            strokes: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
            effects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.2 }, offset: { x: 0, y: 4 }, radius: 12, visible: true, blendMode: "NORMAL" }],
            strokeWeight: 2,
            opacity: 0.75
          }
        });
        const fills = await callTool("figma.get_property", {
          target: "node",
          nodeId: shared.rectangleId,
          property: "fills"
        });
        const opacity = await callTool("figma.get_property", {
          target: "node",
          nodeId: shared.rectangleId,
          property: "opacity"
        });
        assert.equal(fills.value[0].type, "SOLID");
        assert.equal(opacity.value, 0.75);
      }));

    await t.test("auto-layout", () =>
      runCheck("auto-layout", "mutate and verify auto-layout properties", "figma.set_property", async () => {
        await callTool("figma.set_property", {
          target: "node",
          nodeId: shared.autoLayoutId,
          property: "itemSpacing",
          value: 24
        });
        await callTool("figma.set_property", {
          target: "node",
          nodeId: shared.autoLayoutId,
          property: "paddingLeft",
          value: 32
        });
        const itemSpacing = await callTool("figma.get_property", {
          target: "node",
          nodeId: shared.autoLayoutId,
          property: "itemSpacing"
        });
        const paddingLeft = await callTool("figma.get_property", {
          target: "node",
          nodeId: shared.autoLayoutId,
          property: "paddingLeft"
        });
        assert.equal(itemSpacing.value, 24);
        assert.equal(paddingLeft.value, 32);
      }));

    await t.test("components", () =>
      runCheck("components", "create instance and detach", "figma.call_api", async () => {
        const instance = await callTool("figma.call_api", {
          target: "node",
          nodeId: shared.componentId,
          method: "createInstance",
          args: []
        });
        shared.instanceId = instance.result.id;
        await callTool("figma.move_node", {
          nodeId: shared.instanceId,
          x: 520,
          y: 240
        });
        const instanceNode = await callTool("figma.get_node", { nodeId: shared.instanceId });
        assert.equal(instanceNode.node.type, "INSTANCE");
        const detached = await callTool("figma.call_api", {
          target: "node",
          nodeId: shared.instanceId,
          method: "detachInstance",
          args: []
        });
        shared.detachedFrameId = detached.result.id;
        const frame = await callTool("figma.get_node", { nodeId: shared.detachedFrameId });
        assert.equal(frame.node.type, "FRAME");
      }));

    await t.test("variables", () =>
      runCheck("variables", "create, update, list, and remove local variable", "figma.list_variables", async () => {
        const collectionName = `${runId}/variables`;
        const collection = await callTool("figma.call_api", {
          target: "variables",
          method: "createVariableCollection",
          args: [collectionName]
        });
        shared.variableCollectionId = collection.result.id;
        const modeId = collection.result.defaultModeId;
        const variable = await callTool("figma.call_api", {
          target: "variables",
          method: "createVariable",
          args: [`${runId}/color`, { $variableCollectionId: shared.variableCollectionId }, "COLOR"]
        });
        shared.variableId = variable.result.id;
        await callTool("figma.update_variable", {
          variableId: shared.variableId,
          modeId,
          value: { r: 0.2, g: 0.6, b: 0.9, a: 1 }
        });
        const variables = await callTool("figma.list_variables", {});
        assert.ok(variables.collections.some((item) => item.id === shared.variableCollectionId));
        assert.ok(variables.variables.some((item) => item.id === shared.variableId));
        await callTool("figma.call_api", {
          target: "variableCollection",
          variableCollectionId: shared.variableCollectionId,
          method: "remove",
          args: []
        });
        shared.variableCollectionId = undefined;
      }));

    await t.test("export", () =>
      runCheck("export", "export node as PNG", "figma.export_node", async () => {
        const exported = await callTool("figma.export_node", {
          nodeId: shared.rectangleId,
          format: "PNG",
          scale: 1
        });
        assert.equal(exported.mimeType, "image/png");
        assert.ok(exported.base64.length > 20);
      }));

    await t.test("dev mode", async () => {
      await runOptionalCheck("dev mode", "subscribe Codegen generate in Dev Mode", "figma.subscribe_event", async () => {
        if (report.figma.editorType !== "dev") {
          throw unsupported("editor", `Codegen generate is Dev Mode specific; current editor is ${report.figma.editorType}`);
        }
        const subscription = await callTool("figma.subscribe_event", {
          target: "codegen",
          eventType: "generate",
          defaultReturn: []
        });
        assert.ok(subscription.subscriptionId);
        await callTool("figma.unsubscribe_event", { subscriptionId: subscription.subscriptionId });
      });

      await runOptionalCheck("dev mode", "Dev Resources API availability", "figma.call_api", async () => {
        if (report.figma.editorType !== "dev") {
          throw unsupported("editor", `Dev Resources open/linkpreview/auth are Dev Mode specific; current editor is ${report.figma.editorType}`);
        }
        const result = await callTool("figma.get_property", {
          target: "figma",
          property: "devResources"
        });
        assert.ok(result.value === null || typeof result.value === "object");
      });
    });

    await t.test("editor-specific restrictions", async () => {
      await runOptionalCheck("editor-specific restrictions", "FigJam createSticky restriction outside FigJam", "figma.create_node", async () => {
        if (report.figma.editorType === "figjam") {
          const sticky = await callTool("figma.create_node", {
            pageId: testPageId,
            createMethod: "createSticky",
            properties: { name: `${runId}/sticky` }
          });
          await callTool("figma.call_api", {
            target: "node",
            nodeId: sticky.node.id,
            method: "remove",
            args: []
          });
          return;
        }
        await expectToolError("figma.create_node", {
          pageId: testPageId,
          createMethod: "createSticky",
          properties: { name: `${runId}/sticky-should-fail` }
        });
      });
    });

    await t.test("batch transactions", async () => {
      await runCheck("batch transactions", "successful transaction creates both nodes", "figma.batch_operations", async () => {
        const batchName = `${runId}/batch-success`;
        const result = await callTool("figma.batch_operations", {
          transactional: true,
          rollbackOnError: true,
          operations: [
            {
              command: "CREATE_RECTANGLE",
              payload: { pageId: testPageId, name: `${batchName}/rect`, x: 100, y: 520, width: 80, height: 80 }
            },
            {
              command: "CREATE_TEXT",
              payload: { pageId: testPageId, name: `${batchName}/text`, characters: "Batch", x: 200, y: 520 }
            }
          ]
        });
        assert.equal(result.rolledBack, false);
        assert.equal(result.createdNodeIds.length, 2);
        shared.batchSuccessIds = result.createdNodeIds;
      });
    });

    await t.test("rollback behavior", () =>
      runCheck("rollback behavior", "failed transaction rolls back created node", "figma.batch_operations", async () => {
        const rollbackName = `${runId}/rollback-created`;
        const before = await snapshotCurrentPage();
        const result = await callTool("figma.batch_operations", {
          transactional: true,
          rollbackOnError: true,
          continueOnError: false,
          operations: [
            {
              command: "CREATE_RECTANGLE",
              payload: { pageId: testPageId, name: rollbackName, x: 420, y: 520, width: 80, height: 80 }
            },
            {
              command: "RESIZE_NODE",
              payload: { nodeId: "missing-node-id", width: 10, height: 10 }
            }
          ]
        });
        assert.equal(result.rolledBack, true);
        assert.ok(result.results.some((item) => item.success === false));
        const found = await callTool("figma.find_nodes", {
          pageId: testPageId,
          nameContains: rollbackName,
          maxResults: 5
        });
        assert.equal(found.count, 0);
        const after = await snapshotCurrentPage();
        assert.equal(after.nodeCount, before.nodeCount);
      }));
  });
});

test.after(async () => {
  await cleanupFigma();
  await writeReport();
  await client?.close();
});

async function startMcpClient() {
  host = process.env.FIGMA_TEST_HOST ?? "localhost";
  port = Number(process.env.FIGMA_TEST_PORT ?? 3333) || await getFreePort(host);
  const databasePath = `.data/integration-${runId}.sqlite`;
  console.error(
    [
      "Figma MCP runtime integration waiting for plugin connection.",
      `WebSocket URL: ws://${host}:${port}/ws/plugin`,
      `Auth token: ${pluginAuthToken}`
    ].join("\n")
  );
  transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: serverDir,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      PLUGIN_AUTH_TOKEN: pluginAuthToken,
      LOG_LEVEL: process.env.LOG_LEVEL ?? "fatal",
      REQUEST_TIMEOUT_MS: process.env.REQUEST_TIMEOUT_MS ?? "45000"
    }
  });
  client = new Client({ name: "figma-mcp-runtime-tests", version: "0.1.0" });
  await client.connect(transport);
}

async function waitForPluginDocument() {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < pluginTimeoutMs) {
    try {
      return await callToolEnvelope("figma.get_document", {});
    } catch (error) {
      lastError = error;
      if (error.code !== "PLUGIN_DISCONNECTED" && error.code !== "PLUGIN_TIMEOUT") {
        throw error;
      }
      await wait(1000);
    }
  }

  const message = [
    `Figma plugin did not connect within ${pluginTimeoutMs}ms.`,
    `Open a temporary Figma file, run the development plugin from figma-plugin/manifest.json,`,
    `and confirm it can load http://localhost:${port}/plugin/config.`
  ].join(" ");
  if (allowSkipWithoutPlugin) {
    throw unsupported("environment", message);
  }
  const error = new Error(`${message}. Last error: ${lastError?.message ?? "none"}`);
  error.code = "PLUGIN_DISCONNECTED";
  throw error;
}

async function runCheck(category, name, tool, fn) {
  return recordCheck({ category, name, tool, optional: false }, fn);
}

async function runOptionalCheck(category, name, tool, fn) {
  return recordCheck({ category, name, tool, optional: true }, fn);
}

async function recordCheck(meta, fn) {
  const startedAt = Date.now();
  const before = await safeSnapshot();
  const check = {
    category: meta.category,
    name: meta.name,
    tool: meta.tool,
    optional: meta.optional,
    status: "running",
    durationMs: 0,
    editorType: report.figma.editorType,
    before,
    after: null,
    error: null
  };
  report.checks.push(check);
  try {
    const value = await fn();
    check.status = "pass";
    return value;
  } catch (error) {
    if (isUnsupported(error)) {
      check.status = "unsupported";
      check.error = { scope: error.scope, message: error.message };
      addUnsupported(error.scope, meta.tool, meta.name, error.message);
      if (!meta.optional && error.scope !== "editor") {
        throw error;
      }
      return undefined;
    }
    check.status = "fail";
    check.error = serializeError(error);
    throw error;
  } finally {
    check.durationMs = Date.now() - startedAt;
    check.after = await safeSnapshot();
  }
}

async function callTool(name, args, options = {}) {
  const envelope = await callToolEnvelope(name, args, options);
  return envelope.result;
}

async function callToolEnvelope(name, args, options = {}) {
  const attempts = options.attempts ?? 2;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await client.callTool({ name, arguments: args });
      const text = response.content?.find((item) => item.type === "text")?.text;
      if (!text) {
        throw new Error(`Tool ${name} returned no text content`);
      }
      const parsed = JSON.parse(text);
      if (!parsed.success) {
        throw toolError(name, parsed.error);
      }
      if (parsed.result?.ok === false && typeof parsed.result.status === "number") {
        throw toolError(name, {
          code: "HTTP_ERROR",
          message: `HTTP ${parsed.result.status} ${parsed.result.statusText ?? ""}`.trim(),
          details: parsed.result
        });
      }
      if (attempt > 1) {
        markFlaky(name);
      }
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetriable(error)) {
        throw error;
      }
      await wait(500 * attempt);
    }
  }
  throw lastError;
}

async function expectToolError(name, args, expectedCode) {
  let failed = false;
  try {
    await callTool(name, args, { attempts: 1 });
  } catch (error) {
    failed = true;
    if (expectedCode) {
      assert.equal(error.code, expectedCode);
    }
  }
  assert.equal(failed, true, `${name} was expected to fail`);
}

async function snapshotCurrentPage() {
  const current = await callTool("figma.get_current_page", {});
  return pageSnapshot(current.currentPage);
}

async function safeSnapshot() {
  if (!client || !testPageId) {
    return null;
  }
  try {
    return await snapshotCurrentPage();
  } catch {
    return null;
  }
}

function pageSnapshot(page) {
  const ids = [];
  walkNode(page, (node) => ids.push(`${node.id}:${node.name}:${node.type}`));
  ids.sort();
  return {
    pageId: page.id,
    pageName: page.name,
    nodeCount: ids.length,
    hash: crypto.createHash("sha256").update(JSON.stringify(ids)).digest("hex")
  };
}

function walkNode(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    walkNode(child, visit);
  }
}

async function cleanupFigma() {
  if (!client) return;
  if (shared.variableCollectionId) {
    try {
      await callTool("figma.call_api", {
        target: "variableCollection",
        variableCollectionId: shared.variableCollectionId,
        method: "remove",
        args: []
      });
    } catch {
      // Best-effort cleanup continues below.
    }
  }
  if (originalPageId) {
    try {
      await callTool("figma.call_api", {
        target: "figma",
        method: "setCurrentPageAsync",
        args: [{ $pageId: originalPageId }]
      });
    } catch {
      // Best-effort cleanup continues below.
    }
  }
  if (testPageId) {
    try {
      await callTool("figma.call_api", {
        target: "page",
        pageId: testPageId,
        method: "remove",
        args: []
      });
    } catch {
      // The report still records failure details from the test phase.
    }
  }
}

async function writeReport() {
  finalizeReport();
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(reportMdPath, renderMarkdownReport(report));
}

function finalizeReport() {
  const total = report.checks.length;
  const executed = report.checks.filter((check) => check.status === "pass" || check.status === "fail").length;
  const passed = report.checks.filter((check) => check.status === "pass").length;
  const failed = report.checks.filter((check) => check.status === "fail").length;
  const unsupportedCount = report.checks.filter((check) => check.status === "unsupported").length;
  report.summary.totalRuntimeChecks = total;
  report.summary.executedRuntimeChecks = executed;
  report.summary.passedRuntimeChecks = passed;
  report.summary.failedRuntimeChecks = failed;
  report.summary.unsupportedRuntimeChecks = unsupportedCount;
  report.summary.runtimeTestedPercent = total === 0 ? 0 : round((executed / total) * 100);
  report.summary.runtimePassPercent = executed === 0 ? 0 : round((passed / executed) * 100);
}

function renderMarkdownReport(data) {
  const lines = [
    `# Figma MCP Runtime Coverage Report`,
    "",
    `Run ID: \`${data.runId}\``,
    `Generated: \`${data.generatedAt}\``,
    "",
    "## Summary",
    "",
    `- Schema coverage: ${data.summary.schemaCoveragePercent}%`,
    `- Runtime tested: ${data.summary.runtimeTestedPercent}%`,
    `- Runtime pass: ${data.summary.runtimePassPercent}%`,
    `- Runtime checks: ${data.summary.passedRuntimeChecks} passed, ${data.summary.failedRuntimeChecks} failed, ${data.summary.unsupportedRuntimeChecks} unsupported`,
    `- Flaky tools: ${data.flakyTools.length ? data.flakyTools.map((item) => `\`${item}\``).join(", ") : "none"}`,
    "",
    "## Figma",
    "",
    `- File: ${data.figma.fileName ?? "unknown"}`,
    `- Editor: ${data.figma.editorType ?? "unknown"}`,
    `- Temporary page: ${data.figma.temporaryPageName ?? "not created"} (${data.figma.temporaryPageId ?? "n/a"})`,
    "",
    "## Unsupported Tools By Editor",
    "",
    Object.keys(data.unsupportedToolsByEditor).length
      ? JSON.stringify(data.unsupportedToolsByEditor, null, 2)
      : "none",
    "",
    "## Checks",
    "",
    "| Category | Check | Tool | Status | Duration |",
    "| --- | --- | --- | --- | ---: |",
    ...data.checks.map((check) =>
      `| ${escapeMd(check.category)} | ${escapeMd(check.name)} | \`${check.tool}\` | ${check.status} | ${check.durationMs}ms |`
    ),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function addUnsupported(scope, tool, name, message) {
  if (scope === "editor") {
    const editor = report.figma.editorType ?? "unknown";
    report.unsupportedToolsByEditor[editor] ??= [];
    report.unsupportedToolsByEditor[editor].push({ tool, name, message });
    return;
  }
  report.unsupportedByEnvironment.push({ tool, name, message });
}

function unsupported(scope, message) {
  const error = new Error(message);
  error.unsupported = true;
  error.scope = scope;
  return error;
}

function isUnsupported(error) {
  return Boolean(error?.unsupported);
}

function toolError(tool, error) {
  const result = new Error(error?.message ?? `${tool} failed`);
  result.code = error?.code ?? "TOOL_ERROR";
  result.details = error?.details;
  result.tool = tool;
  return result;
}

function serializeError(error) {
  return {
    code: error?.code ?? error?.name ?? "ERROR",
    message: error?.message ?? String(error),
    details: error?.details ?? null
  };
}

function isRetriable(error) {
  return ["PLUGIN_TIMEOUT", "PLUGIN_DISCONNECTED", "ECONNRESET", "EPIPE"].includes(error?.code);
}

function markFlaky(tool) {
  if (!report.flakyTools.includes(tool)) {
    report.flakyTools.push(tool);
  }
}

async function getFreePort(bindHost = "localhost") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, bindHost, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Unable to allocate free port"));
        }
      });
    });
    server.on("error", reject);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round(value) {
  return Number(value.toFixed(2));
}

function escapeMd(value) {
  return String(value).replaceAll("|", "\\|");
}

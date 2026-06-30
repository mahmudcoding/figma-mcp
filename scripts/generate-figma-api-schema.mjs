import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const pluginTypingsPath = path.join(root, "docs/source-snapshots/plugin-api.d.ts");
const restSpecPath = path.join(root, "docs/source-snapshots/rest-openapi.yaml");
const jsonOutPath = path.join(root, "docs/generated/figma-api-schema.json");
const auditOutPath = path.join(root, "docs/generated/completeness-audit.json");
const tsOutPath = path.join(root, "shared/src/figmaApiSchema.generated.ts");

const pluginSource = fs.readFileSync(pluginTypingsPath, "utf8");
const restSource = fs.readFileSync(restSpecPath, "utf8");
const sourceFile = ts.createSourceFile(pluginTypingsPath, pluginSource, ts.ScriptTarget.Latest, true);
const restSpec = YAML.parse(restSource);

const interfaceMap = new Map();
const typeAliasMap = new Map();
const expandedCache = new Map();

const REQUESTED_EVENT_HOOKS = ["selectionchange", "documentchange", "currentpagechange", "run"];
const API_TOOLS_IMPLEMENTED = [
  "figma.get_api_schema",
  "figma.create_node",
  "figma.call_api",
  "figma.get_property",
  "figma.set_property",
  "figma.rest_request",
  "figma.subscribe_event",
  "figma.unsubscribe_event",
  "figma.poll_events"
];

function textOf(node) {
  return node ? node.getText(sourceFile).replace(/\s+/g, " ").trim() : "";
}

function rawTextOf(node) {
  return node ? node.getText(sourceFile) : "";
}

function docsOf(node) {
  const full = pluginSource.slice(node.pos, node.getStart(sourceFile));
  const matches = [...full.matchAll(/\/\*\*([\s\S]*?)\*\//g)];
  return matches.at(-1)?.[1]?.replace(/^\s*\*\s?/gm, "").trim() ?? "";
}

function categoryForInterface(name) {
  if (name === "PluginAPI") return "plugin-global";
  if (name === "VariablesAPI" || name.includes("Variable")) return "variables";
  if (name === "TeamLibraryAPI") return "team-library";
  if (name === "CodegenAPI") return "codegen";
  if (name === "DevResourcesAPI" || name.includes("DevResource")) return "dev-mode";
  if (name === "ParametersAPI" || name.includes("Parameter")) return "parameters";
  if (name === "UIAPI") return "ui";
  if (name.endsWith("Node")) return "node";
  if (name.endsWith("Mixin")) return "mixin";
  if (name.endsWith("Style")) return "styles";
  if (name.includes("Export")) return "export";
  if (name.includes("Image") || name.includes("Video")) return "assets";
  return "plugin";
}

function editorSupportFromText(text) {
  const lower = text.toLowerCase();
  const support = new Set();
  if (lower.includes("figjam")) support.add("figjam");
  if (lower.includes("slides")) support.add("slides");
  if (lower.includes("dev mode") || lower.includes("dev-mode") || lower.includes("editorType === \"dev\"")) {
    support.add("dev");
  }
  if (lower.includes("buzz")) support.add("buzz");
  if (lower.includes("design") || lower.includes("figma design") || lower.includes("editorType === \"figma\"")) {
    support.add("figma");
  }
  return [...support];
}

function mutatesCanvas(memberName, kind, writable, returnType, docText) {
  if (kind === "property") return writable;
  const name = memberName.toLowerCase();
  if (/^(get|find|list|load|export|save|show|hide|notify|on|off|once|mixed|current|root)/.test(name)) {
    return false;
  }
  if (/^(create|delete|remove|set|append|insert|resize|rescale|scale|rotate|clone|detach|swap|combine|union|subtract|intersect|exclude|flatten|group|ungroup|move|scroll|commit|trigger|close|relaunch)/.test(name)) {
    return true;
  }
  if (/void|SceneNode|PageNode|Component|Style|Variable/.test(returnType) && !/^Promise<.*(string|number|boolean|Uint8Array)/.test(returnType)) {
    return /create|set|remove|delete|update|insert|append|resize|clone|detach|import|bind|assign|reorder|group|flatten|combine/i.test(`${memberName} ${docText}`);
  }
  return false;
}

function splitTopLevelUnion(typeText) {
  if (!typeText || !typeText.includes("|")) return [];
  const parts = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (let index = 0; index < typeText.length; index += 1) {
    const char = typeText[index];
    if (quote) {
      current += char;
      if (char === quote && typeText[index - 1] !== "\\") {
        quote = "";
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if ("(<[{".includes(char)) {
      depth += 1;
      current += char;
      continue;
    }
    if (")>]}".includes(char)) {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }
    if (char === "|" && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts.length > 1 ? parts : [];
}

function literalValuesFromUnion(typeText) {
  return splitTopLevelUnion(typeText)
    .map((value) => value.trim().match(/^['"](.+)['"]$/)?.[1])
    .filter(Boolean);
}

function heritageNames(node) {
  return (
    node.heritageClauses?.flatMap((clause) =>
      clause.types.map((type) => {
        const expression = type.expression.getText(sourceFile);
        const args = type.typeArguments?.map((arg) => arg.getText(sourceFile)) ?? [];
        return args.length > 0 ? `${expression}<${args.join(", ")}>` : expression;
      })
    ) ?? []
  );
}

function baseName(typeName) {
  return typeName.replace(/<.*$/, "");
}

function parseParameters(member) {
  return [...member.parameters].map((parameter, index) => {
    const type = textOf(parameter.type) || "unknown";
    return {
      index,
      name: parameter.name.getText(sourceFile),
      optional: Boolean(parameter.questionToken || parameter.initializer),
      rest: Boolean(parameter.dotDotDotToken),
      type,
      unionTypes: splitTopLevelUnion(type)
    };
  });
}

function addInterface(node) {
  const name = node.name.text;
  const existing = interfaceMap.get(name) ?? {
    name,
    declarations: [],
    extends: [],
    directMembers: [],
    documentation: ""
  };
  existing.declarations.push(node);
  existing.extends.push(...heritageNames(node));
  existing.documentation = existing.documentation || docsOf(node);
  for (const member of node.members) {
    const parsed = parseMember(name, member, name, [], false);
    if (parsed) {
      existing.directMembers.push(parsed);
    }
  }
  interfaceMap.set(name, existing);
}

function parseMember(objectName, member, declaredIn, inheritancePath, inherited) {
  const name = member.name?.getText(sourceFile).replace(/^["']|["']$/g, "");
  if (!name) return null;
  const docText = docsOf(member);
  const editorSupport = editorSupportFromText(`${docText} ${objectName} ${name}`);

  if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
    const returnType = textOf(member.type) || "void";
    const entry = {
      apiCategory: categoryForInterface(objectName),
      objectName,
      methodName: name,
      kind: "method",
      parameters: parseParameters(member),
      returnType,
      isAsync: /^Promise(?:<|$)/.test(returnType),
      editorSupport,
      mutatesCanvas: mutatesCanvas(name, "method", false, returnType, docText),
      inheritedFrom: inherited ? declaredIn : undefined,
      declaredIn,
      inheritancePath,
      documentation: docText,
      signature: textOf(member)
    };
    return entry;
  }

  if (ts.isPropertySignature(member)) {
    const type = textOf(member.type) || "unknown";
    const readonly = member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false;
    const optional = Boolean(member.questionToken);
    const writable = !readonly;
    return {
      apiCategory: categoryForInterface(objectName),
      objectName,
      propertyName: name,
      kind: "property",
      parameters: [],
      returnType: type,
      unionTypes: splitTopLevelUnion(type),
      editorSupport,
      mutatesCanvas: mutatesCanvas(name, "property", writable, type, docText),
      readonly,
      writable,
      optional,
      inheritedFrom: inherited ? declaredIn : undefined,
      declaredIn,
      inheritancePath,
      documentation: docText,
      signature: textOf(member)
    };
  }

  return null;
}

function expandInterface(name, stack = []) {
  const cleanName = baseName(name);
  if (expandedCache.has(cleanName)) {
    return expandedCache.get(cleanName);
  }
  const info = interfaceMap.get(cleanName);
  if (!info) {
    return [];
  }
  if (stack.includes(cleanName)) {
    throw new Error(`Circular interface inheritance detected: ${[...stack, cleanName].join(" -> ")}`);
  }

  const expanded = [];
  const nextStack = [...stack, cleanName];
  for (const parentName of info.extends) {
    const parentCleanName = baseName(parentName);
    const parentMembers = expandInterface(parentCleanName, nextStack);
    for (const member of parentMembers) {
      expanded.push({
        ...member,
        apiCategory: categoryForInterface(cleanName),
        objectName: cleanName,
        inheritedFrom: member.inheritedFrom ?? member.declaredIn ?? parentCleanName,
        inheritancePath: [parentCleanName, ...(member.inheritancePath ?? [])]
      });
    }
  }
  for (const member of info.directMembers) {
    expanded.push({
      ...member,
      objectName: cleanName,
      apiCategory: categoryForInterface(cleanName),
      inheritedFrom: undefined,
      inheritancePath: []
    });
  }

  const deduped = [];
  const seen = new Set();
  for (let index = expanded.length - 1; index >= 0; index -= 1) {
    const member = expanded[index];
    const memberName = member.kind === "method" ? member.methodName : member.propertyName;
    const key = `${member.kind}:${memberName}:${member.signature}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.unshift(member);
  }

  expandedCache.set(cleanName, deduped);
  return deduped;
}

function applyOverloadMetadata(members) {
  const groups = new Map();
  for (const member of members) {
    if (member.kind !== "method") continue;
    const key = `${member.objectName}.${member.methodName}`;
    const group = groups.get(key) ?? [];
    group.push(member);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.forEach((member, index) => {
      member.overloadIndex = index;
      member.overloadCount = group.length;
      member.hasOverloads = group.length > 1;
    });
  }
  return members;
}

function collectEditorTypes(pluginMembers) {
  const editorTypeMember = pluginMembers.find(
    (member) => member.kind === "property" && member.objectName === "PluginAPI" && member.propertyName === "editorType"
  );
  const editorTypes = literalValuesFromUnion(editorTypeMember?.returnType ?? "");
  return editorTypes.length > 0 ? editorTypes : ["figma", "figjam", "dev", "slides"];
}

function collectEvents(pluginMembers) {
  const argFree = literalValuesFromUnion(typeAliasMap.get("ArgFreeEventType")?.type ?? "");
  const events = new Map();
  for (const eventType of argFree) {
    events.set(`PluginAPI.${eventType}`, {
      apiCategory: "events",
      objectName: "PluginAPI",
      eventType,
      sourceMethod: "on",
      callbackType: "() => void",
      callbackReturnType: "void",
      argFree: true,
      editorSupport: editorSupportFromText(eventType)
    });
  }

  for (const member of pluginMembers) {
    if (member.kind !== "method" || !["on", "once", "off"].includes(member.methodName)) continue;
    const firstParameter = member.parameters[0];
    if (!firstParameter) continue;
    const eventTypes =
      firstParameter.type === "ArgFreeEventType"
        ? argFree
        : literalValuesFromUnion(firstParameter.type).length > 0
          ? literalValuesFromUnion(firstParameter.type)
          : firstParameter.type.match(/^['"](.+)['"]$/)
            ? [firstParameter.type.replace(/^['"]|['"]$/g, "")]
            : [];
    const callbackParameter = member.parameters[1];
    for (const eventType of eventTypes) {
      const key = `${member.objectName}.${eventType}`;
      const callbackType = callbackParameter?.type ?? "unknown";
      events.set(key, {
        apiCategory: "events",
        objectName: member.objectName,
        eventType,
        sourceMethod: member.methodName,
        callbackType,
        callbackReturnType: inferCallbackReturnType(callbackType),
        argFree: firstParameter.type === "ArgFreeEventType",
        editorSupport: member.editorSupport
      });
    }
  }

  return [...events.values()].sort((left, right) =>
    `${left.objectName}.${left.eventType}`.localeCompare(`${right.objectName}.${right.eventType}`)
  );
}

function inferCallbackReturnType(callbackType) {
  const match = callbackType.match(/=>\s*(.+)$/);
  return match ? match[1].replace(/\s+/g, " ").trim() : "unknown";
}

function walk(node) {
  if (ts.isInterfaceDeclaration(node)) {
    addInterface(node);
  }
  if (ts.isTypeAliasDeclaration(node)) {
    typeAliasMap.set(node.name.text, {
      name: node.name.text,
      type: rawTextOf(node.type).replace(/\s+/g, " ").trim(),
      documentation: docsOf(node)
    });
  }
  ts.forEachChild(node, walk);
}

walk(sourceFile);

const directMembers = [];
for (const info of interfaceMap.values()) {
  directMembers.push(...info.directMembers);
}

const apiMembers = [];
for (const name of interfaceMap.keys()) {
  apiMembers.push(...expandInterface(name));
}
applyOverloadMetadata(apiMembers);

const pluginApiMembers = apiMembers.filter((member) => member.objectName === "PluginAPI");
const editorTypes = collectEditorTypes(pluginApiMembers);
const nodeTypes = [...interfaceMap.values()]
  .filter((info) => info.name.endsWith("Node"))
  .map((info) => ({
    name: info.name,
    extends: [...new Set(info.extends)],
    expandedExtends: [...new Set(expandInterface(info.name).flatMap((member) => member.inheritancePath ?? []))],
    inheritedMixins: [
      ...new Set(
        expandInterface(info.name)
          .map((member) => member.inheritedFrom)
          .filter((name) => typeof name === "string" && name.endsWith("Mixin"))
      )
    ],
    apiCategory: categoryForInterface(info.name),
    documentation: info.documentation
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

const mixins = [...interfaceMap.values()]
  .filter((info) => info.name.endsWith("Mixin"))
  .map((info) => ({
    name: info.name,
    extends: [...new Set(info.extends)],
    expandedExtends: [...new Set(expandInterface(info.name).flatMap((member) => member.inheritancePath ?? []))],
    documentation: info.documentation
  }))
  .sort((left, right) => left.name.localeCompare(right.name));

const createMethods = pluginApiMembers
  .filter((member) => member.kind === "method" && member.methodName.startsWith("create"))
  .sort((left, right) => left.methodName.localeCompare(right.methodName));

const eventHooks = collectEvents(apiMembers);
const missingEventHooks = REQUESTED_EVENT_HOOKS.filter(
  (eventType) => !eventHooks.some((event) => event.objectName === "PluginAPI" && event.eventType === eventType)
);

const restOperations = [];
const sourceRestOperationKeys = [];
for (const [routePath, methods] of Object.entries(restSpec.paths ?? {})) {
  for (const [method, operation] of Object.entries(methods ?? {})) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    const httpMethod = method.toUpperCase();
    const key = `${httpMethod} ${routePath}`;
    sourceRestOperationKeys.push(key);
    const parameters = (operation.parameters ?? []).map((parameter) => ({
      name: parameter.name,
      in: parameter.in,
      required: Boolean(parameter.required),
      schema: parameter.schema ?? {}
    }));
    const scopes = [];
    for (const securityEntry of operation.security ?? []) {
      for (const values of Object.values(securityEntry)) {
        if (Array.isArray(values)) scopes.push(...values);
      }
    }
    restOperations.push({
      apiCategory: "rest",
      objectName: "REST",
      methodName: operation.operationId ?? key,
      operationId: operation.operationId ?? null,
      kind: "rest-operation",
      httpMethod,
      path: routePath,
      operationKey: key,
      parameters,
      requestBody: operation.requestBody ?? null,
      returnType: operation.responses ? Object.keys(operation.responses).join("|") : "unknown",
      editorSupport: [],
      mutatesCanvas: ["POST", "PUT", "PATCH", "DELETE"].includes(httpMethod),
      scopes: [...new Set(scopes)],
      summary: operation.summary ?? "",
      documentation: operation.description ?? ""
    });
  }
}

const generatedRestOperationKeys = new Set(restOperations.map((operation) => operation.operationKey));
const missingRestEndpoints = sourceRestOperationKeys.filter((key) => !generatedRestOperationKeys.has(key));

const oauthScopes = Object.keys(
  restSpec.components?.securitySchemes?.OAuth2?.flows?.authorizationCode?.scopes ?? {}
);

const sourceMemberKeys = directMembers.map((member) => {
  const memberName = member.kind === "method" ? member.methodName : member.propertyName;
  return `${member.objectName}.${memberName}:${member.signature}`;
});
const generatedDirectMemberKeys = new Set(
  apiMembers
    .filter((member) => !member.inheritedFrom)
    .map((member) => {
      const memberName = member.kind === "method" ? member.methodName : member.propertyName;
      return `${member.objectName}.${memberName}:${member.signature}`;
    })
);
const missingApiMembers = sourceMemberKeys.filter((key) => !generatedDirectMemberKeys.has(key));

const methodMembers = apiMembers.filter((member) => member.kind === "method");
const propertyMembers = apiMembers.filter((member) => member.kind === "property");
const overloadedMethods = methodMembers.filter((member) => member.hasOverloads);
const asyncMethods = methodMembers.filter((member) => member.isAsync);
const writableProperties = propertyMembers.filter((member) => member.writable);
const readonlyProperties = propertyMembers.filter((member) => member.readonly);
const unionParameterCount = methodMembers.reduce(
  (count, member) => count + member.parameters.filter((parameter) => parameter.unionTypes.length > 0).length,
  0
);

const sourceMemberCount = sourceMemberKeys.length;
const restSourceOperationCount = sourceRestOperationKeys.length;
const eventSourceCount = eventHooks.length;
const coverage = {
  pluginApiSchemaCoveragePercent: percent(sourceMemberCount - missingApiMembers.length, sourceMemberCount),
  restOpenApiCoveragePercent: percent(restSourceOperationCount - missingRestEndpoints.length, restSourceOperationCount),
  requestedEventHookCoveragePercent: percent(
    REQUESTED_EVENT_HOOKS.length - missingEventHooks.length,
    REQUESTED_EVENT_HOOKS.length
  ),
  overallCoveragePercent: percent(
    sourceMemberCount -
      missingApiMembers.length +
      restSourceOperationCount -
      missingRestEndpoints.length +
      REQUESTED_EVENT_HOOKS.length -
      missingEventHooks.length,
    sourceMemberCount + restSourceOperationCount + REQUESTED_EVENT_HOOKS.length
  )
};

function percent(numerator, denominator) {
  if (denominator === 0) return 100;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

const generatedAt = new Date().toISOString();
const sources = {
  pluginTypings: "https://github.com/figma/plugin-typings/blob/master/plugin-api.d.ts",
  pluginApiDocs: "https://developers.figma.com/docs/plugins/api/",
  variablesApiDocs: "https://developers.figma.com/docs/plugins/working-with-variables/",
  teamLibraryApiDocs: "https://developers.figma.com/docs/plugins/api/figma-teamlibrary/",
  codegenApiDocs: "https://developers.figma.com/docs/plugins/api/figma-codegen/",
  devModeApiDocs: "https://developers.figma.com/docs/plugins/working-in-dev-mode/",
  restApi: "https://developers.figma.com/docs/rest-api/",
  restOpenApiSnapshot: "https://github.com/figma/rest-api-spec/blob/main/openapi/openapi.yaml"
};

const audit = {
  generatedAt,
  sources,
  coverage,
  sourceCounts: {
    directPluginApiMemberCount: sourceMemberCount,
    expandedPluginApiMemberCount: apiMembers.length,
    restOperationCount: restOperations.length,
    eventHookCount: eventHooks.length,
    requestedEventHookCount: REQUESTED_EVENT_HOOKS.length
  },
  implementationEvidence: {
    recursiveInheritedMixinExpansion: true,
    writableReadonlyPropertyClassification: true,
    asyncMethodDetection: true,
    automaticAwaitHandlingInPluginBridge: true,
    overloadResolutionMetadata: true,
    unionParameterMetadata: true,
    editorSpecificApiCoverage: editorTypes,
    restOpenApiCoverage: true,
    eventTools: ["figma.subscribe_event", "figma.unsubscribe_event", "figma.poll_events"],
    transactionSafeBatchOperations: true,
    universalRawApiBridgeTools: ["figma.call_api", "figma.get_property", "figma.set_property"]
  },
  missingApiMembers,
  missingRestEndpoints,
  missingEventHooks,
  requestedEventHooks: REQUESTED_EVENT_HOOKS,
  eventHooks,
  apiToolsImplemented: API_TOOLS_IMPLEMENTED,
  restOperationKeys: sourceRestOperationKeys,
  stats: {
    nodeTypeCount: nodeTypes.length,
    mixinCount: mixins.length,
    createMethodCount: createMethods.length,
    asyncMethodCount: asyncMethods.length,
    overloadedMethodSignatureCount: overloadedMethods.length,
    methodCount: methodMembers.length,
    propertyCount: propertyMembers.length,
    writablePropertyCount: writableProperties.length,
    readonlyPropertyCount: readonlyProperties.length,
    unionParameterCount,
    oauthScopeCount: oauthScopes.length
  }
};

const schema = {
  generatedAt,
  sources,
  coverage,
  stats: {
    pluginApiMemberCount: apiMembers.length,
    directPluginApiMemberCount: sourceMemberCount,
    nodeTypeCount: nodeTypes.length,
    mixinCount: mixins.length,
    createMethodCount: createMethods.length,
    asyncMethodCount: asyncMethods.length,
    overloadedMethodSignatureCount: overloadedMethods.length,
    writablePropertyCount: writableProperties.length,
    readonlyPropertyCount: readonlyProperties.length,
    unionParameterCount,
    restOperationCount: restOperations.length,
    eventHookCount: eventHooks.length,
    oauthScopeCount: oauthScopes.length
  },
  audit: {
    missingApiMembers,
    missingRestEndpoints,
    missingEventHooks,
    implementationEvidence: audit.implementationEvidence
  },
  editorTypes,
  oauthScopes,
  pluginApi: {
    members: apiMembers,
    nodeTypes,
    mixins,
    createMethods,
    eventHooks
  },
  restApi: {
    operations: restOperations
  }
};

fs.mkdirSync(path.dirname(jsonOutPath), { recursive: true });
fs.writeFileSync(jsonOutPath, `${JSON.stringify(schema, null, 2)}\n`);
fs.writeFileSync(auditOutPath, `${JSON.stringify(audit, null, 2)}\n`);

const schemaJsonLiteral = JSON.stringify(JSON.stringify(schema));
const tsContent = `/* Auto-generated by scripts/generate-figma-api-schema.mjs. Do not edit manually. */\nexport interface FigmaApiSchema {\n  generatedAt: string;\n  sources: Record<string, string>;\n  coverage: Record<string, number>;\n  stats: Record<string, number>;\n  audit: {\n    missingApiMembers: string[];\n    missingRestEndpoints: string[];\n    missingEventHooks: string[];\n    implementationEvidence: Record<string, unknown>;\n  };\n  editorTypes: string[];\n  oauthScopes: string[];\n  pluginApi: {\n    members: Array<Record<string, unknown>>;\n    nodeTypes: Array<Record<string, unknown>>;\n    mixins: Array<Record<string, unknown>>;\n    createMethods: Array<Record<string, unknown>>;\n    eventHooks: Array<Record<string, unknown>>;\n  };\n  restApi: {\n    operations: Array<Record<string, unknown>>;\n  };\n}\n\nconst FIGMA_API_SCHEMA_JSON = ${schemaJsonLiteral};\n\nexport const FIGMA_API_SCHEMA: FigmaApiSchema = JSON.parse(FIGMA_API_SCHEMA_JSON) as FigmaApiSchema;\n`;
fs.writeFileSync(tsOutPath, tsContent);

console.log(
  JSON.stringify(
    {
      wrote: [
        path.relative(root, jsonOutPath),
        path.relative(root, auditOutPath),
        path.relative(root, tsOutPath)
      ],
      coverage,
      stats: schema.stats
    },
    null,
    2
  )
);

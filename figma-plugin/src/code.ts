import {
  AppError,
  CommandSchemas,
  PluginCommand,
  type PluginCommand as PluginCommandType,
  type StructuredError,
  type SerializedNode,
  toStructuredError
} from "@custom-figma-mcp/shared";

type UnknownRecord = Record<string, unknown>;
type PlacementInput = {
  parentId?: string | undefined;
  pageId?: string | undefined;
  index?: number | undefined;
  x?: number | undefined;
  y?: number | undefined;
};
type BoundsInput = {
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
};
type TextUpdateInput = {
  characters?: string | undefined;
  fontFamily?: string | undefined;
  fontStyle?: string | undefined;
  fontSize?: number | undefined;
};
type ApiTargetPayload = {
  target?: string | undefined;
  targetPath?: string[] | undefined;
  nodeId?: string | undefined;
  pageId?: string | undefined;
  styleId?: string | undefined;
  variableId?: string | undefined;
  variableCollectionId?: string | undefined;
  imageHash?: string | undefined;
};
type EventSubscription = {
  id: string;
  eventType: string;
  target: string;
  targetPath?: string[] | undefined;
  targetPayload: ApiTargetPayload;
  handler: (...args: unknown[]) => unknown;
  maxQueueSize: number;
};
type EventRecord = {
  sequence: number;
  subscriptionId: string;
  eventType: string;
  target: string;
  targetPath?: string[] | undefined;
  timestamp: string;
  payload: unknown;
};

interface ExecuteCommandMessage {
  type: "EXECUTE_COMMAND";
  requestId: string;
  command: PluginCommandType;
  payload: UnknownRecord;
}

figma.showUI(__html__, {
  width: 420,
  height: 460,
  themeColors: true
});

const eventSubscriptions = new Map<string, EventSubscription>();
const eventQueue: EventRecord[] = [];
let eventSequence = 0;

sendPluginMetadata();

figma.on("selectionchange", () => {
  sendPluginMetadata();
});

figma.ui.onmessage = async (message: ExecuteCommandMessage | { type: "REQUEST_METADATA" }) => {
  if (message.type === "REQUEST_METADATA") {
    sendPluginMetadata();
    return;
  }

  if (message.type !== "EXECUTE_COMMAND") {
    return;
  }

  try {
    const result = await executeCommand(message.command, message.payload);
    figma.ui.postMessage({
      type: "COMMAND_RESULT",
      requestId: message.requestId,
      success: true,
      result
    });
  } catch (error) {
    figma.ui.postMessage({
      type: "COMMAND_RESULT",
      requestId: message.requestId,
      success: false,
      error: toStructuredError(error)
    });
  }
};

function sendPluginMetadata(): void {
  figma.ui.postMessage({
    type: "PLUGIN_METADATA",
    payload: {
      protocolVersion: "1.0.0",
      pluginId: "custom-figma-mcp-bridge",
      fileKey: figma.fileKey ?? undefined,
      fileName: figma.root.name,
      editorType: figma.editorType,
      currentPageId: figma.currentPage.id,
      currentPageName: figma.currentPage.name,
      selection: figma.currentPage.selection.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type
      }))
    }
  });
}

async function executeCommand(command: PluginCommandType, payload: UnknownRecord): Promise<unknown> {
  switch (command) {
    case PluginCommand.GET_DOCUMENT:
      CommandSchemas[PluginCommand.GET_DOCUMENT].parse(payload);
      return getDocument();
    case PluginCommand.GET_CURRENT_PAGE:
      CommandSchemas[PluginCommand.GET_CURRENT_PAGE].parse(payload);
      return getCurrentPage();
    case PluginCommand.GET_SELECTION:
      CommandSchemas[PluginCommand.GET_SELECTION].parse(payload);
      return getSelection();
    case PluginCommand.FIND_NODES:
      return findNodes(CommandSchemas[PluginCommand.FIND_NODES].parse(payload));
    case PluginCommand.GET_NODE:
      return getNodeResult(CommandSchemas[PluginCommand.GET_NODE].parse(payload));
    case PluginCommand.CREATE_FRAME:
      return createFrame(CommandSchemas[PluginCommand.CREATE_FRAME].parse(payload));
    case PluginCommand.CREATE_TEXT:
      return createText(CommandSchemas[PluginCommand.CREATE_TEXT].parse(payload));
    case PluginCommand.CREATE_RECTANGLE:
      return createRectangle(CommandSchemas[PluginCommand.CREATE_RECTANGLE].parse(payload));
    case PluginCommand.CREATE_COMPONENT:
      return createComponent(CommandSchemas[PluginCommand.CREATE_COMPONENT].parse(payload));
    case PluginCommand.CREATE_AUTOLAYOUT:
      return createAutoLayout(CommandSchemas[PluginCommand.CREATE_AUTOLAYOUT].parse(payload));
    case PluginCommand.CREATE_NODE:
      return createNode(CommandSchemas[PluginCommand.CREATE_NODE].parse(payload));
    case PluginCommand.UPDATE_NODE:
      return updateNode(CommandSchemas[PluginCommand.UPDATE_NODE].parse(payload));
    case PluginCommand.MOVE_NODE:
      return moveNode(CommandSchemas[PluginCommand.MOVE_NODE].parse(payload));
    case PluginCommand.RESIZE_NODE:
      return resizeNode(CommandSchemas[PluginCommand.RESIZE_NODE].parse(payload));
    case PluginCommand.DELETE_NODE:
      return deleteNode(CommandSchemas[PluginCommand.DELETE_NODE].parse(payload));
    case PluginCommand.DUPLICATE_NODE:
      return duplicateNode(CommandSchemas[PluginCommand.DUPLICATE_NODE].parse(payload));
    case PluginCommand.EXPORT_NODE:
      return exportNode(CommandSchemas[PluginCommand.EXPORT_NODE].parse(payload));
    case PluginCommand.LIST_STYLES:
      CommandSchemas[PluginCommand.LIST_STYLES].parse(payload);
      return listStyles();
    case PluginCommand.LIST_VARIABLES:
      CommandSchemas[PluginCommand.LIST_VARIABLES].parse(payload);
      return listVariables();
    case PluginCommand.UPDATE_VARIABLE:
      return updateVariable(CommandSchemas[PluginCommand.UPDATE_VARIABLE].parse(payload));
    case PluginCommand.BATCH_OPERATIONS:
      return batchOperations(CommandSchemas[PluginCommand.BATCH_OPERATIONS].parse(payload));
    case PluginCommand.CALL_API:
      return callApi(CommandSchemas[PluginCommand.CALL_API].parse(payload));
    case PluginCommand.GET_PROPERTY:
      return getProperty(CommandSchemas[PluginCommand.GET_PROPERTY].parse(payload));
    case PluginCommand.SET_PROPERTY:
      return setProperty(CommandSchemas[PluginCommand.SET_PROPERTY].parse(payload));
    case PluginCommand.SUBSCRIBE_EVENT:
      return subscribeEvent(CommandSchemas[PluginCommand.SUBSCRIBE_EVENT].parse(payload));
    case PluginCommand.UNSUBSCRIBE_EVENT:
      return unsubscribeEvent(CommandSchemas[PluginCommand.UNSUBSCRIBE_EVENT].parse(payload));
    case PluginCommand.POLL_EVENTS:
      return pollEvents(CommandSchemas[PluginCommand.POLL_EVENTS].parse(payload));
    case PluginCommand.GET_API_SCHEMA:
    case PluginCommand.REST_REQUEST:
      throw new AppError("UNSUPPORTED_OPERATION", `${command} is handled by the MCP server`);
    default:
      throw new AppError("UNSUPPORTED_OPERATION", `Unsupported command ${String(command)}`);
  }
}

async function getDocument(): Promise<unknown> {
  const pages = [];
  for (const page of figma.root.children) {
    await loadPage(page);
    pages.push(serializeNode(page, { includeChildren: true, depth: 1 }));
  }

  return {
    fileKey: figma.fileKey ?? null,
    name: figma.root.name,
    editorType: figma.editorType,
    currentPageId: figma.currentPage.id,
    pages
  };
}

async function getCurrentPage(): Promise<unknown> {
  await loadPage(figma.currentPage);
  return {
    currentPage: serializeNode(figma.currentPage, { includeChildren: true, depth: 2 })
  };
}

async function getSelection(): Promise<unknown> {
  await loadPage(figma.currentPage);
  return {
    selection: figma.currentPage.selection.map((node) =>
      serializeNode(node, { includeChildren: true, depth: 1 })
    )
  };
}

async function findNodes(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.FIND_NODES]>): Promise<unknown> {
  const maxResults = payload.maxResults ?? 100;
  const pages = payload.allPages
    ? figma.root.children
    : [payload.pageId ? await getPage(payload.pageId) : figma.currentPage];
  const matches: SerializedNode[] = [];

  for (const page of pages) {
    await loadPage(page);
    const nodes = page.findAll((node) => {
      if (matches.length >= maxResults) {
        return false;
      }
      return nodeMatches(node, payload);
    });

    for (const node of nodes) {
      matches.push(
        serializeNode(node, {
          includeChildren: payload.includeChildren ?? false,
          depth: payload.includeChildren ? 2 : 0
        })
      );
      if (matches.length >= maxResults) {
        break;
      }
    }
  }

  return { nodes: matches, count: matches.length };
}

async function getNodeResult(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.GET_NODE]>): Promise<unknown> {
  const node = await getNode(payload.nodeId);
  return { node: serializeNode(node, { includeChildren: true, depth: 2 }) };
}

async function createFrame(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.CREATE_FRAME]>): Promise<unknown> {
  const frame = figma.createFrame();
  frame.name = payload.name ?? "Frame";
  await placeCreatedNode(frame, payload);
  applyBounds(frame, payload, { width: 320, height: 240 });
  applyLayout(frame, payload.layout);
  applyStyle(frame, payload.style);
  return createdResult(frame);
}

async function createText(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.CREATE_TEXT]>): Promise<unknown> {
  const text = figma.createText();
  text.name = payload.name ?? "Text";
  const fontName: FontName = {
    family: payload.fontFamily ?? "Inter",
    style: payload.fontStyle ?? "Regular"
  };
  await figma.loadFontAsync(fontName);
  text.fontName = fontName;
  text.fontSize = payload.fontSize ?? 16;
  text.characters = payload.characters ?? "";
  await placeCreatedNode(text, payload);
  applyBounds(text, payload, { width: Math.max(1, text.width), height: Math.max(1, text.height) });
  applyStyle(text, payload.style);
  return createdResult(text);
}

async function createRectangle(
  payload: zInfer<typeof CommandSchemas[typeof PluginCommand.CREATE_RECTANGLE]>
): Promise<unknown> {
  const rectangle = figma.createRectangle();
  rectangle.name = payload.name ?? "Rectangle";
  await placeCreatedNode(rectangle, payload);
  applyBounds(rectangle, payload, { width: 160, height: 120 });
  applyStyle(rectangle, payload.style);
  return createdResult(rectangle);
}

async function createComponent(
  payload: zInfer<typeof CommandSchemas[typeof PluginCommand.CREATE_COMPONENT]>
): Promise<unknown> {
  const component = figma.createComponent();
  component.name = payload.name ?? "Component";
  await placeCreatedNode(component, payload);
  applyBounds(component, payload, { width: 320, height: 160 });
  applyLayout(component, payload.layout);
  applyStyle(component, payload.style);
  return createdResult(component);
}

async function createAutoLayout(
  payload: zInfer<typeof CommandSchemas[typeof PluginCommand.CREATE_AUTOLAYOUT]>
): Promise<unknown> {
  const frame = figma.createFrame();
  frame.name = payload.name ?? "Auto Layout";
  frame.layoutMode = payload.layout?.layoutMode === "HORIZONTAL" ? "HORIZONTAL" : "VERTICAL";
  frame.primaryAxisSizingMode = payload.layout?.primaryAxisSizingMode ?? "AUTO";
  frame.counterAxisSizingMode = payload.layout?.counterAxisSizingMode ?? "AUTO";
  await placeCreatedNode(frame, payload);
  applyBounds(frame, payload, { width: 320, height: 240 });
  applyLayout(frame, payload.layout);
  applyStyle(frame, payload.style);
  return createdResult(frame);
}

async function createNode(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.CREATE_NODE]>): Promise<unknown> {
  const method = (figma as unknown as UnknownRecord)[payload.createMethod];
  if (typeof method !== "function") {
    throw new AppError("UNSUPPORTED_OPERATION", `figma.${payload.createMethod} is not callable in this editor`);
  }

  const result = await method.apply(figma, await resolveApiArgs(payload.args ?? []));
  if (isBaseNode(result)) {
    if ("x" in result || "y" in result || payload.parentId || payload.pageId) {
      await placeCreatedNode(result as SceneNode, payload);
    }
    await applyDynamicProperties(result, payload.properties ?? {});
    return {
      createdNodeIds: [result.id],
      node: serializeNode(result, { includeChildren: true, depth: 1 })
    };
  }

  await applyDynamicProperties(result, payload.properties ?? {});
  return {
    createMethod: payload.createMethod,
    result: serializeApiValue(result)
  };
}

async function applyDynamicProperties(target: unknown, properties: Record<string, unknown>): Promise<void> {
  if (!target || typeof target !== "object") {
    return;
  }
  for (const [key, value] of Object.entries(properties)) {
    const resolved = await resolveApiArg(value);
    if (key === "width" || key === "height") {
      continue;
    }
    (target as UnknownRecord)[key] = resolved;
  }

  if (
    "resize" in target &&
    typeof target.resize === "function" &&
    (typeof properties.width === "number" || typeof properties.height === "number")
  ) {
    const node = target as SceneNode & { resize(width: number, height: number): void };
    node.resize(
      typeof properties.width === "number" ? properties.width : node.width,
      typeof properties.height === "number" ? properties.height : node.height
    );
  }
}

async function updateNode(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.UPDATE_NODE]>): Promise<unknown> {
  const node = await getNode(payload.nodeId);
  const sceneNode = assertSceneNode(node);

  if (payload.name) {
    sceneNode.name = payload.name;
  }

  if (payload.bounds) {
    applyBounds(sceneNode, payload.bounds, { width: sceneNode.width, height: sceneNode.height });
  }

  if (payload.layout) {
    applyLayout(sceneNode, payload.layout);
  }

  if (payload.style) {
    applyStyle(sceneNode, payload.style);
  }

  if (sceneNode.type === "TEXT" && (payload.characters !== undefined || payload.fontFamily || payload.fontStyle || payload.fontSize)) {
    await updateTextNode(sceneNode, payload);
  }

  return {
    mutatedNodeIds: [sceneNode.id],
    node: serializeNode(sceneNode, { includeChildren: true, depth: 1 })
  };
}

async function moveNode(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.MOVE_NODE]>): Promise<unknown> {
  const node = assertSceneNode(await getNode(payload.nodeId));

  if (payload.parentId) {
    const parent = await getChildrenContainer(payload.parentId);
    insertIntoParent(parent, node, payload.index);
  }

  if (payload.x !== undefined) {
    node.x = payload.x;
  }
  if (payload.y !== undefined) {
    node.y = payload.y;
  }

  return {
    mutatedNodeIds: [node.id],
    node: serializeNode(node, { includeChildren: false, depth: 0 })
  };
}

async function resizeNode(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.RESIZE_NODE]>): Promise<unknown> {
  const node = assertResizableSceneNode(await getNode(payload.nodeId));
  node.resize(payload.width, payload.height);
  return {
    mutatedNodeIds: [node.id],
    node: serializeNode(node, { includeChildren: false, depth: 0 })
  };
}

async function deleteNode(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.DELETE_NODE]>): Promise<unknown> {
  const node = assertSceneNode(await getNode(payload.nodeId));
  const deleted = { id: node.id, name: node.name, type: node.type };
  node.remove();
  return { deletedNodeIds: [deleted.id], deleted };
}

async function duplicateNode(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.DUPLICATE_NODE]>): Promise<unknown> {
  const node = assertSceneNode(await getNode(payload.nodeId));
  const clone = node.clone();
  if (payload.parentId) {
    const parent = await getChildrenContainer(payload.parentId);
    parent.appendChild(clone);
  }
  clone.x = node.x + (payload.offsetX ?? 24);
  clone.y = node.y + (payload.offsetY ?? 24);
  return createdResult(clone);
}

async function exportNode(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.EXPORT_NODE]>): Promise<unknown> {
  const node = assertSceneNode(await getNode(payload.nodeId));
  const format = payload.format ?? "PNG";
  const settings: ExportSettings =
    format === "SVG"
      ? { format: "SVG" }
      : format === "PDF"
        ? { format: "PDF" }
        : {
            format,
            constraint: { type: "SCALE", value: payload.scale ?? 1 }
          };

  const bytes = await node.exportAsync(settings);
  return {
    nodeId: node.id,
    format,
    mimeType: mimeTypeForFormat(format),
    base64: bytesToBase64(bytes)
  };
}

async function listStyles(): Promise<unknown> {
  const [text, paint, effect, grid] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync()
  ]);

  return {
    text: text.map(serializeStyle),
    paint: paint.map(serializeStyle),
    effect: effect.map(serializeStyle),
    grid: grid.map(serializeStyle)
  };
}

async function listVariables(): Promise<unknown> {
  if (!figma.variables) {
    throw new AppError("UNSUPPORTED_OPERATION", "Figma variables API is not available in this editor");
  }

  const [collections, variables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync()
  ]);

  return {
    collections: collections.map((collection) => ({
      id: collection.id,
      key: collection.key,
      name: collection.name,
      modes: collection.modes,
      defaultModeId: collection.defaultModeId,
      variableIds: collection.variableIds
    })),
    variables: variables.map((variable) => ({
      id: variable.id,
      key: variable.key,
      name: variable.name,
      resolvedType: variable.resolvedType,
      remote: variable.remote,
      variableCollectionId: variable.variableCollectionId,
      valuesByMode: variable.valuesByMode,
      scopes: variable.scopes
    }))
  };
}

async function updateVariable(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.UPDATE_VARIABLE]>): Promise<unknown> {
  if (!figma.variables) {
    throw new AppError("UNSUPPORTED_OPERATION", "Figma variables API is not available in this editor");
  }

  if (!payload.variableId && !payload.variableKey) {
    throw new AppError("VALIDATION_ERROR", "Either variableId or variableKey is required");
  }

  const variable = payload.variableId
    ? await figma.variables.getVariableByIdAsync(payload.variableId)
    : await figma.variables.importVariableByKeyAsync(payload.variableKey!);

  if (!variable) {
    throw new AppError("NODE_NOT_FOUND", "Variable was not found");
  }

  variable.setValueForMode(payload.modeId, payload.value as VariableValue);
  return {
    variable: {
      id: variable.id,
      key: variable.key,
      name: variable.name,
      modeId: payload.modeId,
      value: payload.value
    }
  };
}

async function batchOperations(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.BATCH_OPERATIONS]>): Promise<unknown> {
  const results = [];
  const mutatedNodeIds: string[] = [];
  const createdNodeIds: string[] = [];
  const transactional = payload.transactional !== false;
  const rollbackOnError = payload.rollbackOnError !== false;
  let failed = false;
  let successfulMutationCount = 0;

  if (transactional) {
    figma.commitUndo();
  }

  for (const operation of payload.operations) {
    if (operation.command === PluginCommand.BATCH_OPERATIONS) {
      const error = new AppError("UNSUPPORTED_OPERATION", "Nested batch operations are not allowed");
      failed = true;
      if (!payload.continueOnError) {
        results.push({ success: false, command: operation.command, error: error.toJSON() });
        break;
      }
      results.push({ success: false, command: operation.command, error: error.toJSON() });
      continue;
    }

    try {
      const result = await executeCommand(operation.command, operation.payload);
      const createdIds = isRecord(result) && Array.isArray(result.createdNodeIds) ? result.createdNodeIds : [];
      const mutatedIds = isRecord(result) && Array.isArray(result.mutatedNodeIds) ? result.mutatedNodeIds : [];
      const deletedIds = isRecord(result) && Array.isArray(result.deletedNodeIds) ? result.deletedNodeIds : [];
      if (isRecord(result)) {
        collectIds(createdIds, createdNodeIds);
        collectIds(mutatedIds, mutatedNodeIds);
      }
      if (
        createdIds.length > 0 ||
        mutatedIds.length > 0 ||
        deletedIds.length > 0 ||
        batchOperationMayMutate(operation.command, operation.payload)
      ) {
        successfulMutationCount += 1;
      }
      results.push({ success: true, command: operation.command, result });
    } catch (error) {
      const structured = toStructuredError(error);
      failed = true;
      results.push({ success: false, command: operation.command, error: structured });
      if (!payload.continueOnError) {
        break;
      }
    }
  }

  if (transactional && failed && rollbackOnError) {
    if (successfulMutationCount > 0) {
      figma.commitUndo();
      figma.triggerUndo();
      figma.commitUndo();
    }
    return { results, createdNodeIds, mutatedNodeIds, transactional, rolledBack: true };
  }

  if (transactional && !failed) {
    figma.commitUndo();
  }

  return { results, createdNodeIds, mutatedNodeIds, transactional, rolledBack: false };
}

function batchOperationMayMutate(command: PluginCommandType, payload: unknown): boolean {
  switch (command) {
    case PluginCommand.CREATE_FRAME:
    case PluginCommand.CREATE_TEXT:
    case PluginCommand.CREATE_RECTANGLE:
    case PluginCommand.CREATE_COMPONENT:
    case PluginCommand.CREATE_AUTOLAYOUT:
    case PluginCommand.CREATE_NODE:
    case PluginCommand.UPDATE_NODE:
    case PluginCommand.MOVE_NODE:
    case PluginCommand.RESIZE_NODE:
    case PluginCommand.DELETE_NODE:
    case PluginCommand.DUPLICATE_NODE:
    case PluginCommand.UPDATE_VARIABLE:
    case PluginCommand.SET_PROPERTY:
    case PluginCommand.REST_REQUEST:
      return true;
    case PluginCommand.CALL_API:
      return isRecord(payload) && typeof payload.method === "string" && rawApiMethodMayMutate(payload.method);
    default:
      return false;
  }
}

function rawApiMethodMayMutate(method: string): boolean {
  return /^(create|set|add|edit|delete|remove|resize|rescale|detach|swap|append|insert|group|ungroup|flatten|union|subtract|intersect|exclude|combine)/.test(method);
}

async function subscribeEvent(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.SUBSCRIBE_EVENT]>): Promise<unknown> {
  if (payload.eventType === "documentchange" && payload.loadAllPages !== false) {
    await figma.loadAllPagesAsync();
  }

  const target = await resolveApiTarget(payload);
  const eventHost = target as UnknownRecord;
  const eventMethod = payload.once ? eventHost.once : eventHost.on;
  if (typeof eventMethod !== "function") {
    throw new AppError("UNSUPPORTED_OPERATION", `${eventTargetLabel(payload)} does not support event subscriptions`);
  }

  const subscriptionId = `${payload.eventType}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
  const defaultReturn =
    payload.defaultReturn === undefined
      ? defaultReturnForEvent(payload.eventType)
      : await resolveApiArg(payload.defaultReturn);
  const handler = (...args: unknown[]): unknown => {
    enqueueEvent({
      sequence: 0,
      subscriptionId,
      eventType: payload.eventType,
      target: payload.target ?? "figma",
      targetPath: payload.targetPath,
      timestamp: new Date().toISOString(),
      payload: args.length <= 1 ? serializeApiValue(args[0]) : args.map((arg) => serializeApiValue(arg))
    }, payload.maxQueueSize ?? 1000);
    if (payload.once) {
      eventSubscriptions.delete(subscriptionId);
    }
    return defaultReturn;
  };

  eventMethod.call(target, payload.eventType, handler);
  eventSubscriptions.set(subscriptionId, {
    id: subscriptionId,
    eventType: payload.eventType,
    target: payload.target ?? "figma",
    targetPath: payload.targetPath,
    targetPayload: payload,
    handler,
    maxQueueSize: payload.maxQueueSize ?? 1000
  });

  return {
    subscriptionId,
    eventType: payload.eventType,
    target: payload.target ?? "figma",
    targetPath: payload.targetPath ?? [],
    once: payload.once ?? false
  };
}

async function unsubscribeEvent(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.UNSUBSCRIBE_EVENT]>): Promise<unknown> {
  if (!payload.subscriptionId && !payload.eventType) {
    throw new AppError("VALIDATION_ERROR", "subscriptionId or eventType is required");
  }

  const removed = [];
  for (const subscription of [...eventSubscriptions.values()]) {
    if (payload.subscriptionId && subscription.id !== payload.subscriptionId) {
      continue;
    }
    if (payload.eventType && subscription.eventType !== payload.eventType) {
      continue;
    }

    const target = await resolveApiTarget(subscription.targetPayload);
    const eventHost = target as UnknownRecord;
    if (typeof eventHost.off === "function") {
      eventHost.off(subscription.eventType, subscription.handler);
    }
    eventSubscriptions.delete(subscription.id);
    removed.push(subscription.id);
  }

  return {
    removedSubscriptionIds: removed,
    remainingSubscriptionIds: [...eventSubscriptions.keys()]
  };
}

function pollEvents(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.POLL_EVENTS]>): unknown {
  const limit = payload.limit ?? 100;
  const events = eventQueue
    .filter((event) => !payload.eventType || event.eventType === payload.eventType)
    .filter((event) => payload.sinceSequence === undefined || event.sequence > payload.sinceSequence)
    .slice(-limit);

  return {
    events,
    count: events.length,
    latestSequence: eventSequence,
    activeSubscriptions: [...eventSubscriptions.values()].map((subscription) => ({
      subscriptionId: subscription.id,
      eventType: subscription.eventType,
      target: subscription.target,
      targetPath: subscription.targetPath ?? []
    }))
  };
}

function enqueueEvent(event: EventRecord, maxQueueSize: number): void {
  eventSequence += 1;
  eventQueue.push({ ...event, sequence: eventSequence });
  while (eventQueue.length > maxQueueSize) {
    eventQueue.shift();
  }
}

function defaultReturnForEvent(eventType: string): unknown {
  switch (eventType) {
    case "drop":
      return false;
    case "textreview":
    case "generate":
      return [];
    case "auth":
    case "linkpreview":
      return null;
    default:
      return undefined;
  }
}

async function callApi(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.CALL_API]>): Promise<unknown> {
  const target = await resolveApiTarget(payload);
  const method = (target as UnknownRecord)[payload.method];
  if (typeof method !== "function") {
    throw new AppError("UNSUPPORTED_OPERATION", `Method ${payload.method} is not callable on ${payload.target}`);
  }

  const args = await normalizeCallApiArgs(payload, await resolveApiArgs(payload.args ?? []));
  const result = await method.apply(target, args);
  const response: UnknownRecord = {
    target: payload.target,
    method: payload.method,
    result: serializeApiValue(result)
  };
  if (payload.method.startsWith("create") && isBaseNode(result)) {
    response.createdNodeIds = [result.id];
  }
  return response;
}

async function normalizeCallApiArgs(
  payload: zInfer<typeof CommandSchemas[typeof PluginCommand.CALL_API]>,
  args: unknown[]
): Promise<unknown[]> {
  if (
    payload.target === "variables" &&
    payload.method === "createVariable" &&
    typeof args[1] === "string"
  ) {
    return [args[0], await getVariableCollection(args[1]), args[2]];
  }

  return args;
}

async function getProperty(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.GET_PROPERTY]>): Promise<unknown> {
  const target = await resolveApiTarget(payload);
  return {
    target: payload.target,
    property: payload.property,
    value: serializeApiValue((target as UnknownRecord)[payload.property])
  };
}

async function setProperty(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.SET_PROPERTY]>): Promise<unknown> {
  const target = await resolveApiTarget(payload);
  const resolvedValue = await resolveApiArg(payload.value);
  (target as UnknownRecord)[payload.property] = resolvedValue;
  return {
    target: payload.target,
    property: payload.property,
    value: serializeApiValue((target as UnknownRecord)[payload.property])
  };
}

async function resolveApiTarget(
  payload: ApiTargetPayload
): Promise<unknown> {
  const targetName = payload.target ?? "figma";
  let target: unknown;
  switch (targetName) {
    case "figma":
      target = figma;
      break;
    case "root":
      target = figma.root;
      break;
    case "currentPage":
      target = figma.currentPage;
      break;
    case "selection":
      target = figma.currentPage.selection;
      break;
    case "node":
      if (!payload.nodeId) throw new AppError("VALIDATION_ERROR", "nodeId is required for node target");
      target = await getNode(payload.nodeId);
      break;
    case "page":
      if (!payload.pageId) throw new AppError("VALIDATION_ERROR", "pageId is required for page target");
      target = await getPage(payload.pageId);
      break;
    case "style":
      if (!payload.styleId) throw new AppError("VALIDATION_ERROR", "styleId is required for style target");
      target = getStyle(payload.styleId);
      break;
    case "variable":
      if (!payload.variableId) throw new AppError("VALIDATION_ERROR", "variableId is required for variable target");
      target = await getVariable(payload.variableId);
      break;
    case "variableCollection":
      if (!payload.variableCollectionId) {
        throw new AppError("VALIDATION_ERROR", "variableCollectionId is required for variableCollection target");
      }
      target = await getVariableCollection(payload.variableCollectionId);
      break;
    case "variables":
      target = requireFigmaObject("variables");
      break;
    case "teamLibrary":
      target = requireFigmaObject("teamLibrary");
      break;
    case "codegen":
      target = requireFigmaObject("codegen");
      break;
    case "devResources":
      target = requireFigmaObject("devResources");
      break;
    case "clientStorage":
      target = requireFigmaObject("clientStorage");
      break;
    case "parameters":
      target = requireFigmaObject("parameters");
      break;
    case "ui":
      target = figma.ui;
      break;
    case "image": {
      if (!payload.imageHash) throw new AppError("VALIDATION_ERROR", "imageHash is required for image target");
      const image = figma.getImageByHash(payload.imageHash);
      if (!image) {
        throw new AppError("NODE_NOT_FOUND", `Image ${payload.imageHash} was not found`);
      }
      target = image;
      break;
    }
    case "path":
      if (!payload.targetPath || payload.targetPath.length === 0) {
        throw new AppError("VALIDATION_ERROR", "targetPath is required for path target");
      }
      target = figma;
      break;
    default:
      throw new AppError("VALIDATION_ERROR", `Unknown API target ${targetName}`);
  }

  return resolveApiTargetPath(target, payload.targetPath);
}

function resolveApiTargetPath(target: unknown, targetPath: string[] | undefined): unknown {
  let current = target;
  for (const segment of targetPath ?? []) {
    if (current === null || current === undefined) {
      throw new AppError("VALIDATION_ERROR", `Cannot resolve target path segment ${segment} from null target`);
    }
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
    } else {
      current = (current as UnknownRecord)[segment];
    }
    if (current === undefined) {
      throw new AppError("VALIDATION_ERROR", `Target path segment ${segment} is undefined`);
    }
  }
  return current;
}

function eventTargetLabel(payload: zInfer<typeof CommandSchemas[typeof PluginCommand.SUBSCRIBE_EVENT]>): string {
  const target = payload.target ?? "figma";
  return payload.targetPath?.length ? `${target}.${payload.targetPath.join(".")}` : target;
}

async function resolveApiArgs(args: unknown[]): Promise<unknown[]> {
  const resolved = [];
  for (const arg of args) {
    resolved.push(await resolveApiArg(arg));
  }
  return resolved;
}

async function resolveApiArg(arg: unknown): Promise<unknown> {
  if (Array.isArray(arg)) {
    return Promise.all(arg.map((item) => resolveApiArg(item)));
  }

  if (!isRecord(arg)) {
    return arg;
  }

  if (typeof arg.$nodeId === "string") {
    return getNode(arg.$nodeId);
  }
  if (typeof arg.$pageId === "string") {
    return getPage(arg.$pageId);
  }
  if (typeof arg.$styleId === "string") {
    return getStyle(arg.$styleId);
  }
  if (typeof arg.$variableId === "string") {
    return getVariable(arg.$variableId);
  }
  if (typeof arg.$variableCollectionId === "string") {
    return getVariableCollection(arg.$variableCollectionId);
  }
  if (typeof arg.$imageHash === "string") {
    const image = figma.getImageByHash(arg.$imageHash);
    if (!image) {
      throw new AppError("NODE_NOT_FOUND", `Image ${arg.$imageHash} was not found`);
    }
    return image;
  }
  if (Array.isArray(arg.$targetPath) && arg.$targetPath.every((segment) => typeof segment === "string")) {
    return resolveApiTargetPath(figma, arg.$targetPath);
  }
  if (arg.$mixed === true) {
    return figma.mixed;
  }
  if (typeof arg.$bytesBase64 === "string") {
    return base64ToBytes(arg.$bytesBase64);
  }

  const output: UnknownRecord = {};
  for (const [key, value] of Object.entries(arg)) {
    output[key] = await resolveApiArg(value);
  }
  return output;
}

function serializeApiValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === figma.mixed) {
    return "MIXED";
  }
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return {
      type: "Uint8Array",
      base64: bytesToBase64(value),
      byteLength: value.byteLength
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeApiValue(item, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    if ("id" in value && "type" in value && "name" in value) {
      return serializeNode(value as BaseNode, { includeChildren: false, depth: 0 });
    }
    if ("id" in value && "name" in value && "type" in value && "remote" in value) {
      return serializeStyle(value as BaseStyle);
    }
    if ("id" in value && "resolvedType" in value && "valuesByMode" in value) {
      const variable = value as Variable;
      return {
        id: variable.id,
        key: variable.key,
        name: variable.name,
        resolvedType: variable.resolvedType,
        remote: variable.remote,
        variableCollectionId: variable.variableCollectionId,
        valuesByMode: variable.valuesByMode,
        scopes: variable.scopes
      };
    }
    if ("id" in value && "variableIds" in value && "modes" in value) {
      const collection = value as VariableCollection;
      return {
        id: collection.id,
        key: collection.key,
        name: collection.name,
        modes: collection.modes,
        defaultModeId: collection.defaultModeId,
        variableIds: collection.variableIds,
        remote: collection.remote
      };
    }

    const output: UnknownRecord = {};
    for (const [key, child] of Object.entries(value as UnknownRecord)) {
      if (typeof child !== "function") {
        output[key] = serializeApiValue(child, seen);
      }
    }
    return output;
  }
  return String(value);
}

async function getNode(id: string): Promise<BaseNode> {
  const node = await figma.getNodeByIdAsync(id);
  if (!node) {
    throw new AppError("NODE_NOT_FOUND", `Node ${id} was not found`);
  }
  return node;
}

function getStyle(id: string): BaseStyle {
  const style = figma.getStyleById(id);
  if (!style) {
    throw new AppError("NODE_NOT_FOUND", `Style ${id} was not found`);
  }
  return style;
}

async function getVariable(id: string): Promise<Variable> {
  if (!figma.variables) {
    throw new AppError("UNSUPPORTED_OPERATION", "Figma variables API is not available in this editor");
  }
  const variable = await figma.variables.getVariableByIdAsync(id);
  if (!variable) {
    throw new AppError("NODE_NOT_FOUND", `Variable ${id} was not found`);
  }
  return variable;
}

async function getVariableCollection(id: string): Promise<VariableCollection> {
  if (!figma.variables) {
    throw new AppError("UNSUPPORTED_OPERATION", "Figma variables API is not available in this editor");
  }
  const collection = await figma.variables.getVariableCollectionByIdAsync(id);
  if (!collection) {
    throw new AppError("NODE_NOT_FOUND", `Variable collection ${id} was not found`);
  }
  return collection;
}

function requireFigmaObject<TName extends keyof PluginAPI>(name: TName): NonNullable<PluginAPI[TName]> {
  const value = figma[name];
  if (!value) {
    throw new AppError("UNSUPPORTED_OPERATION", `figma.${String(name)} is not available in this editor`);
  }
  return value as NonNullable<PluginAPI[TName]>;
}

async function getPage(id: string): Promise<PageNode> {
  const node = await getNode(id);
  if (node.type !== "PAGE") {
    throw new AppError("VALIDATION_ERROR", `Node ${id} is not a page`);
  }
  return node;
}

async function loadPage(page: PageNode): Promise<void> {
  if ("loadAsync" in page) {
    await page.loadAsync();
  }
}

function assertSceneNode(node: BaseNode): SceneNode {
  if (!("x" in node) || !("y" in node) || !("remove" in node)) {
    throw new AppError("UNSUPPORTED_OPERATION", `Node ${node.id} is not a mutable scene node`);
  }
  return node as SceneNode;
}

function assertResizableSceneNode(node: BaseNode): SceneNode & { resize(width: number, height: number): void } {
  const sceneNode = assertSceneNode(node);
  if (!("resize" in sceneNode)) {
    throw new AppError("UNSUPPORTED_OPERATION", `Node ${node.id} cannot be resized`);
  }
  return sceneNode as SceneNode & { resize(width: number, height: number): void };
}

async function getChildrenContainer(id: string): Promise<BaseNode & ChildrenMixin> {
  const node = await getNode(id);
  if (!("appendChild" in node) || !("children" in node)) {
    throw new AppError("UNSUPPORTED_OPERATION", `Node ${id} cannot contain children`);
  }
  return node as BaseNode & ChildrenMixin;
}

async function placeCreatedNode(
  node: SceneNode,
  payload: PlacementInput
): Promise<void> {
  if (payload.pageId) {
    const page = await getPage(payload.pageId);
    await figma.setCurrentPageAsync(page);
  }

  const parent = payload.parentId ? await getChildrenContainer(payload.parentId) : figma.currentPage;
  insertIntoParent(parent, node, payload.index);
  if (payload.x !== undefined) {
    node.x = payload.x;
  }
  if (payload.y !== undefined) {
    node.y = payload.y;
  }
}

function insertIntoParent(parent: BaseNode & ChildrenMixin, node: SceneNode, index?: number): void {
  if (index !== undefined && index <= parent.children.length) {
    parent.insertChild(index, node);
    return;
  }
  parent.appendChild(node);
}

function applyBounds(
  node: SceneNode,
  bounds: BoundsInput,
  defaults: { width: number; height: number }
): void {
  if (bounds.x !== undefined) {
    node.x = bounds.x;
  }
  if (bounds.y !== undefined) {
    node.y = bounds.y;
  }

  if ("resize" in node) {
    const width = bounds.width ?? ("width" in node ? node.width : defaults.width);
    const height = bounds.height ?? ("height" in node ? node.height : defaults.height);
    node.resize(width, height);
  }
}

function applyLayout(node: SceneNode, layout: UnknownRecord | undefined): void {
  if (!layout || !("layoutMode" in node)) {
    return;
  }

  const layoutNode = node as FrameNode | ComponentNode | InstanceNode;
  if (layout.layoutMode) {
    layoutNode.layoutMode = layout.layoutMode as "NONE" | "HORIZONTAL" | "VERTICAL";
  }
  if (layout.primaryAxisSizingMode) {
    layoutNode.primaryAxisSizingMode = layout.primaryAxisSizingMode as "FIXED" | "AUTO";
  }
  if (layout.counterAxisSizingMode) {
    layoutNode.counterAxisSizingMode = layout.counterAxisSizingMode as "FIXED" | "AUTO";
  }
  if (layout.primaryAxisAlignItems) {
    layoutNode.primaryAxisAlignItems = layout.primaryAxisAlignItems as "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  }
  if (layout.counterAxisAlignItems) {
    layoutNode.counterAxisAlignItems = layout.counterAxisAlignItems as "MIN" | "CENTER" | "MAX" | "BASELINE";
  }
  for (const key of ["itemSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const) {
    if (typeof layout[key] === "number") {
      layoutNode[key] = layout[key] as number;
    }
  }
}

function applyStyle(node: SceneNode, style: UnknownRecord | undefined): void {
  if (!style) {
    return;
  }

  if (Array.isArray(style.fills) && "fills" in node) {
    node.fills = clone(style.fills) as Paint[];
  }
  if (Array.isArray(style.strokes) && "strokes" in node) {
    node.strokes = clone(style.strokes) as Paint[];
  }
  if (Array.isArray(style.effects) && "effects" in node) {
    node.effects = clone(style.effects) as Effect[];
  }
  if (typeof style.strokeWeight === "number" && "strokeWeight" in node) {
    node.strokeWeight = style.strokeWeight;
  }
  if (typeof style.cornerRadius === "number" && "cornerRadius" in node) {
    (node as SceneNode & { cornerRadius: number }).cornerRadius = style.cornerRadius;
  }
  if (typeof style.opacity === "number" && "opacity" in node) {
    node.opacity = style.opacity;
  }
  if (typeof style.visible === "boolean") {
    node.visible = style.visible;
  }
  if (typeof style.locked === "boolean" && "locked" in node) {
    node.locked = style.locked;
  }
  if (typeof style.rotation === "number" && "rotation" in node) {
    node.rotation = style.rotation;
  }
}

async function updateTextNode(
  node: TextNode,
  payload: TextUpdateInput
): Promise<void> {
  const currentFont = node.fontName === figma.mixed ? { family: "Inter", style: "Regular" } : node.fontName;
  const fontName: FontName = {
    family: payload.fontFamily ?? currentFont.family,
    style: payload.fontStyle ?? currentFont.style
  };
  await figma.loadFontAsync(fontName);
  node.fontName = fontName;
  if (payload.fontSize !== undefined) {
    node.fontSize = payload.fontSize;
  }
  if (payload.characters !== undefined) {
    node.characters = payload.characters;
  }
}

function serializeNode(
  node: BaseNode,
  options: { includeChildren: boolean; depth: number }
): SerializedNode {
  const result: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    parentId: node.parent?.id ?? null
  };

  if ("visible" in node) {
    result.visible = node.visible;
  }
  if ("locked" in node) {
    result.locked = node.locked;
  }
  if ("x" in node) {
    result.x = node.x;
  }
  if ("y" in node) {
    result.y = node.y;
  }
  if ("width" in node) {
    result.width = node.width;
  }
  if ("height" in node) {
    result.height = node.height;
  }
  if ("rotation" in node) {
    result.rotation = node.rotation;
  }
  if ("opacity" in node) {
    result.opacity = node.opacity;
  }
  if ("fills" in node) {
    result.fills = safeClone(node.fills);
  }
  if ("strokes" in node) {
    result.strokes = safeClone(node.strokes);
  }
  if ("effects" in node) {
    result.effects = safeClone(node.effects);
  }
  if ("layoutMode" in node) {
    result.layoutMode = node.layoutMode;
  }
  if (node.type === "TEXT") {
    result.characters = node.characters;
  }
  if (node.type === "COMPONENT") {
    result.componentKey = node.key;
  }
  if (options.includeChildren && options.depth > 0 && "children" in node) {
    result.children = node.children.map((child) =>
      serializeNode(child, { includeChildren: true, depth: options.depth - 1 })
    );
  }
  return result;
}

function nodeMatches(node: SceneNode, payload: zInfer<typeof CommandSchemas[typeof PluginCommand.FIND_NODES]>): boolean {
  if (payload.type && node.type !== payload.type) {
    return false;
  }
  if (payload.nameContains && !node.name.toLowerCase().includes(payload.nameContains.toLowerCase())) {
    return false;
  }
  if (payload.query) {
    const query = payload.query.toLowerCase();
    return node.id.toLowerCase() === query || node.name.toLowerCase().includes(query) || node.type.toLowerCase().includes(query);
  }
  return true;
}

function serializeStyle(style: BaseStyle): UnknownRecord {
  return {
    id: style.id,
    key: style.key,
    name: style.name,
    type: style.type,
    description: style.description,
    remote: style.remote
  };
}

function createdResult(node: SceneNode): UnknownRecord {
  return {
    createdNodeIds: [node.id],
    node: serializeNode(node, { includeChildren: true, depth: 1 })
  };
}

function mimeTypeForFormat(format: string): string {
  switch (format) {
    case "JPG":
      return "image/jpeg";
    case "SVG":
      return "image/svg+xml";
    case "PDF":
      return "application/pdf";
    default:
      return "image/png";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeClone(value: unknown): unknown {
  if (value === figma.mixed) {
    return "MIXED";
  }
  return clone(value);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function isBaseNode(value: unknown): value is BaseNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    "type" in value
  );
}

function collectIds(value: unknown, target: string[]): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    if (typeof item === "string") {
      target.push(item);
    }
  }
}

type zInfer<T> = T extends { parse(data: unknown): infer R } ? R : never;

import type { z } from "zod";
import type { StructuredError } from "./errors.js";
import type { CommandSchemas } from "./schemas.js";

export const PROTOCOL_VERSION = "1.0.0";

export const PluginCommand = {
  GET_DOCUMENT: "GET_DOCUMENT",
  GET_CURRENT_PAGE: "GET_CURRENT_PAGE",
  GET_SELECTION: "GET_SELECTION",
  FIND_NODES: "FIND_NODES",
  GET_NODE: "GET_NODE",
  CREATE_FRAME: "CREATE_FRAME",
  CREATE_TEXT: "CREATE_TEXT",
  CREATE_RECTANGLE: "CREATE_RECTANGLE",
  CREATE_COMPONENT: "CREATE_COMPONENT",
  CREATE_AUTOLAYOUT: "CREATE_AUTOLAYOUT",
  CREATE_NODE: "CREATE_NODE",
  UPDATE_NODE: "UPDATE_NODE",
  MOVE_NODE: "MOVE_NODE",
  RESIZE_NODE: "RESIZE_NODE",
  DELETE_NODE: "DELETE_NODE",
  DUPLICATE_NODE: "DUPLICATE_NODE",
  EXPORT_NODE: "EXPORT_NODE",
  LIST_STYLES: "LIST_STYLES",
  LIST_VARIABLES: "LIST_VARIABLES",
  UPDATE_VARIABLE: "UPDATE_VARIABLE",
  BATCH_OPERATIONS: "BATCH_OPERATIONS",
  GET_API_SCHEMA: "GET_API_SCHEMA",
  CALL_API: "CALL_API",
  GET_PROPERTY: "GET_PROPERTY",
  SET_PROPERTY: "SET_PROPERTY",
  SUBSCRIBE_EVENT: "SUBSCRIBE_EVENT",
  UNSUBSCRIBE_EVENT: "UNSUBSCRIBE_EVENT",
  POLL_EVENTS: "POLL_EVENTS"
} as const;

export type PluginCommand = (typeof PluginCommand)[keyof typeof PluginCommand];

export const McpToolName = {
  "figma.get_document": PluginCommand.GET_DOCUMENT,
  "figma.get_current_page": PluginCommand.GET_CURRENT_PAGE,
  "figma.get_selection": PluginCommand.GET_SELECTION,
  "figma.find_nodes": PluginCommand.FIND_NODES,
  "figma.get_node": PluginCommand.GET_NODE,
  "figma.create_frame": PluginCommand.CREATE_FRAME,
  "figma.create_text": PluginCommand.CREATE_TEXT,
  "figma.create_rectangle": PluginCommand.CREATE_RECTANGLE,
  "figma.create_component": PluginCommand.CREATE_COMPONENT,
  "figma.create_autolayout": PluginCommand.CREATE_AUTOLAYOUT,
  "figma.create_node": PluginCommand.CREATE_NODE,
  "figma.update_node": PluginCommand.UPDATE_NODE,
  "figma.move_node": PluginCommand.MOVE_NODE,
  "figma.resize_node": PluginCommand.RESIZE_NODE,
  "figma.delete_node": PluginCommand.DELETE_NODE,
  "figma.duplicate_node": PluginCommand.DUPLICATE_NODE,
  "figma.export_node": PluginCommand.EXPORT_NODE,
  "figma.list_styles": PluginCommand.LIST_STYLES,
  "figma.list_variables": PluginCommand.LIST_VARIABLES,
  "figma.update_variable": PluginCommand.UPDATE_VARIABLE,
  "figma.batch_operations": PluginCommand.BATCH_OPERATIONS,
  "figma.get_api_schema": PluginCommand.GET_API_SCHEMA,
  "figma.call_api": PluginCommand.CALL_API,
  "figma.get_property": PluginCommand.GET_PROPERTY,
  "figma.set_property": PluginCommand.SET_PROPERTY,
  "figma.subscribe_event": PluginCommand.SUBSCRIBE_EVENT,
  "figma.unsubscribe_event": PluginCommand.UNSUBSCRIBE_EVENT,
  "figma.poll_events": PluginCommand.POLL_EVENTS
} as const;

export type McpToolName = keyof typeof McpToolName;

export type CommandPayload<TCommand extends PluginCommand> = z.infer<
  (typeof CommandSchemas)[TCommand]
>;

export interface PluginHelloMessage {
  type: "HELLO";
  requestId: string;
  authToken: string;
  payload: {
    protocolVersion: string;
    pluginId: string;
    fileName?: string;
    editorType?: string;
  };
}

export interface PluginHeartbeatMessage {
  type: "PING" | "PONG";
  requestId: string;
  authToken: string;
  payload?: Record<string, unknown>;
}

export interface CommandMessage<TCommand extends PluginCommand = PluginCommand> {
  type: TCommand;
  requestId: string;
  authToken: string;
  payload: CommandPayload<TCommand>;
}

export interface CommandResultMessage {
  requestId: string;
  success: true;
  result: unknown;
}

export interface CommandErrorMessage {
  requestId: string;
  success: false;
  error: StructuredError;
}

export type ServerToPluginMessage = CommandMessage | PluginHeartbeatMessage;
export type PluginToServerMessage =
  | PluginHelloMessage
  | PluginHeartbeatMessage
  | CommandResultMessage
  | CommandErrorMessage;

export interface SerializedNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  locked?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  parentId?: string | null;
  children?: SerializedNode[];
  fills?: unknown;
  strokes?: unknown;
  effects?: unknown;
  layoutMode?: string;
  characters?: string;
  componentKey?: string;
}

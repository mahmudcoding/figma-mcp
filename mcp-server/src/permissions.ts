import { PluginCommand, type PluginCommand as PluginCommandType } from "@custom-figma-mcp/shared";

const MUTATING_COMMANDS = new Set<PluginCommandType>([
  PluginCommand.CREATE_FRAME,
  PluginCommand.CREATE_TEXT,
  PluginCommand.CREATE_RECTANGLE,
  PluginCommand.CREATE_COMPONENT,
  PluginCommand.CREATE_AUTOLAYOUT,
  PluginCommand.CREATE_NODE,
  PluginCommand.UPDATE_NODE,
  PluginCommand.MOVE_NODE,
  PluginCommand.RESIZE_NODE,
  PluginCommand.DELETE_NODE,
  PluginCommand.DUPLICATE_NODE,
  PluginCommand.UPDATE_VARIABLE,
  PluginCommand.BATCH_OPERATIONS,
  PluginCommand.CALL_API,
  PluginCommand.SET_PROPERTY,
  PluginCommand.REST_REQUEST
]);

export function isMutation(command: PluginCommandType): boolean {
  return MUTATING_COMMANDS.has(command);
}

export function assertOperationAllowed(command: PluginCommandType): void {
  if (!Object.values(PluginCommand).includes(command)) {
    throw new Error(`Unsupported command ${command}`);
  }
}

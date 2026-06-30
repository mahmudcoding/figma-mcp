import type { Logger } from "pino";
import {
  CommandSchemas,
  FIGMA_API_SCHEMA,
  PluginCommand,
  type PluginCommand as PluginCommandType,
  toStructuredError
} from "@custom-figma-mcp/shared";
import type { AuditRepository } from "./db/repositories.js";
import type { FigmaWebSocketHub } from "./wsHub.js";
import { assertOperationAllowed } from "./permissions.js";
import type { RestApiService } from "./restApi.js";

export class CommandDispatcher {
  public constructor(
    private readonly hub: FigmaWebSocketHub,
    private readonly audit: AuditRepository,
    private readonly logger: Logger,
    private readonly restApi: RestApiService
  ) {}

  public async execute(command: PluginCommandType, payload: unknown): Promise<unknown> {
    assertOperationAllowed(command);
    const parsed = CommandSchemas[command].parse(payload);

    try {
      const result =
        command === PluginCommand.GET_API_SCHEMA
          ? filterApiSchema(parsed)
          : command === PluginCommand.REST_REQUEST
            ? await this.restApi.request(parsed)
            : await this.hub.sendCommand(command, parsed);
      this.audit.write({ command, payload: parsed, result, success: true });
      return result;
    } catch (error) {
      const structured = toStructuredError(error);
      this.audit.write({ command, payload: parsed, result: structured, success: false });
      this.logger.error({ command, error: structured }, "Figma command failed");
      throw error;
    }
  }
}

function filterApiSchema(payload: unknown): unknown {
  const query = payload as {
    category?: string;
    objectName?: string;
    memberName?: string;
    restOperationId?: string;
    mutatesCanvas?: boolean;
    limit?: number;
  };
  const limit = query.limit ?? 500;

  const pluginMembers = FIGMA_API_SCHEMA.pluginApi.members
    .filter((member) => !query.category || member.apiCategory === query.category)
    .filter((member) => !query.objectName || member.objectName === query.objectName)
    .filter((member) => {
      if (!query.memberName) return true;
      return (
        ("methodName" in member && member.methodName === query.memberName) ||
        ("propertyName" in member && member.propertyName === query.memberName)
      );
    })
    .filter((member) => query.mutatesCanvas === undefined || member.mutatesCanvas === query.mutatesCanvas)
    .slice(0, limit);

  const restOperations = FIGMA_API_SCHEMA.restApi.operations
    .filter((operation) => !query.restOperationId || operation.methodName === query.restOperationId)
    .filter((operation) => !query.category || operation.apiCategory === query.category)
    .filter((operation) => query.mutatesCanvas === undefined || operation.mutatesCanvas === query.mutatesCanvas)
    .slice(0, limit);

  return {
    generatedAt: FIGMA_API_SCHEMA.generatedAt,
    sources: FIGMA_API_SCHEMA.sources,
    coverage: FIGMA_API_SCHEMA.coverage,
    stats: FIGMA_API_SCHEMA.stats,
    audit: FIGMA_API_SCHEMA.audit,
    editorTypes: FIGMA_API_SCHEMA.editorTypes,
    oauthScopes: FIGMA_API_SCHEMA.oauthScopes,
    pluginApi: {
      members: pluginMembers,
      nodeTypes: FIGMA_API_SCHEMA.pluginApi.nodeTypes,
      mixins: FIGMA_API_SCHEMA.pluginApi.mixins,
      createMethods: FIGMA_API_SCHEMA.pluginApi.createMethods,
      eventHooks: FIGMA_API_SCHEMA.pluginApi.eventHooks
    },
    restApi: {
      operations: restOperations
    }
  };
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ZodObject, ZodRawShape } from "zod";
import {
  CommandSchemas,
  McpToolName,
  type McpToolName as McpToolNameType,
  type PluginCommand as PluginCommandType,
  toStructuredError
} from "@custom-figma-mcp/shared";

interface ToolMetadata {
  title: string;
  description: string;
}

interface CommandExecutor {
  execute(command: PluginCommandType, payload: unknown): Promise<unknown>;
}

const TOOL_METADATA: Record<McpToolNameType, ToolMetadata> = {
  "figma.get_document": {
    title: "Get Figma document",
    description: "Return serialized pages and top-level nodes from the open Figma document."
  },
  "figma.get_current_page": {
    title: "Get current page",
    description: "Return serialized data for the current Figma page."
  },
  "figma.get_selection": {
    title: "Get selection",
    description: "Return serialized data for the current Figma selection."
  },
  "figma.find_nodes": {
    title: "Find nodes",
    description: "Search nodes by name, type, CSS-like query, page, or document scope."
  },
  "figma.get_node": {
    title: "Get node",
    description: "Return serialized data for a specific node."
  },
  "figma.create_frame": {
    title: "Create frame",
    description: "Create a native Figma frame."
  },
  "figma.create_text": {
    title: "Create text",
    description: "Create editable native Figma text, loading the requested font first."
  },
  "figma.create_rectangle": {
    title: "Create rectangle",
    description: "Create a native Figma rectangle."
  },
  "figma.create_component": {
    title: "Create component",
    description: "Create a native Figma component."
  },
  "figma.create_autolayout": {
    title: "Create auto-layout",
    description: "Create a Figma auto-layout frame."
  },
  "figma.create_node": {
    title: "Create via any figma.create* API",
    description: "Call any current or future figma.create* method discovered from official typings, then optionally set properties and reparent the result."
  },
  "figma.update_node": {
    title: "Update node",
    description: "Update node properties, styles, layout, bounds, or text."
  },
  "figma.move_node": {
    title: "Move node",
    description: "Move a node within the canvas or reparent it."
  },
  "figma.resize_node": {
    title: "Resize node",
    description: "Resize a node."
  },
  "figma.delete_node": {
    title: "Delete node",
    description: "Delete a node from the open Figma file."
  },
  "figma.duplicate_node": {
    title: "Duplicate node",
    description: "Duplicate a node by cloning it."
  },
  "figma.export_node": {
    title: "Export node",
    description: "Export a node as PNG, JPG, SVG, or PDF and return base64 content."
  },
  "figma.list_styles": {
    title: "List styles",
    description: "List local text, paint, effect, and grid styles."
  },
  "figma.list_variables": {
    title: "List variables",
    description: "List local variable collections and variables."
  },
  "figma.update_variable": {
    title: "Update variable",
    description: "Update a local or imported Figma variable mode value."
  },
  "figma.batch_operations": {
    title: "Batch operations",
    description: "Run multiple plugin commands in sequence with undo-backed transactional rollback by default."
  },
  "figma.get_api_schema": {
    title: "Get generated Figma API schema",
    description: "Return the generated contract parsed from Figma Plugin API typings."
  },
  "figma.call_api": {
    title: "Call raw Figma Plugin API",
    description: "Dynamically call any Plugin API method on figma, a node, page, style, variable, or API namespace."
  },
  "figma.get_property": {
    title: "Get raw Figma Plugin API property",
    description: "Read any serializable Plugin API property from figma, a node, page, style, variable, or API namespace."
  },
  "figma.set_property": {
    title: "Set raw Figma Plugin API property",
    description: "Set any writable Plugin API property on figma, a node, page, style, variable, or API namespace."
  },
  "figma.subscribe_event": {
    title: "Subscribe to Figma event",
    description: "Subscribe to a Figma Plugin API event on figma or another event-capable API target and queue events for polling."
  },
  "figma.unsubscribe_event": {
    title: "Unsubscribe from Figma event",
    description: "Remove a previously registered Figma Plugin API event subscription by subscription id or event type."
  },
  "figma.poll_events": {
    title: "Poll Figma events",
    description: "Poll queued Figma Plugin API events captured by subscribe_event."
  }
};

function zodShape(schema: ZodObject<ZodRawShape>): ZodRawShape {
  return schema.shape;
}

export async function startMcpServer(dispatcher: CommandExecutor): Promise<void> {
  const server = new McpServer({
    name: "custom-figma-mcp",
    version: "0.1.0"
  });

  for (const [toolName, command] of Object.entries(McpToolName) as Array<[McpToolNameType, typeof McpToolName[McpToolNameType]]>) {
    const schema = CommandSchemas[command];
    const metadata = TOOL_METADATA[toolName];

    server.registerTool(
      toolName,
      {
        title: metadata.title,
        description: metadata.description,
        inputSchema: zodShape(schema)
      },
      async (args) => {
        try {
          const result = await dispatcher.execute(command, args);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, result }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: false, error: toStructuredError(error) }, null, 2)
              }
            ]
          };
        }
      }
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

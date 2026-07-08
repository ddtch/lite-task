/**
 * lite-task MCP Server
 *
 * Exposes task manager data as MCP tools for Claude / Claude Desktop.
 * Run with: deno task mcp
 *
 * Add to claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "lite-task": {
 *       "command": "deno",
 *       "args": ["run", "-A", "/absolute/path/to/task-light/mcp/server.ts"]
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Tool definitions and handlers live in mcp/toolkit.ts (shared with the /mcp
// HTTP route). The db file is resolved relative to cwd — make sure to run
// `deno task mcp` from the task-light directory.
import { handleToolCall, TOOLS } from "./toolkit.ts";

const server = new Server(
  { name: "lite-task", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    return await handleToolCall(name, a);
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

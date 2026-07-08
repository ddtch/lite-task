/**
 * MCP Streamable HTTP endpoint
 *
 * Exposes the lite-task MCP server over HTTP so Cursor (and other MCP clients)
 * can connect with a plain URL instead of spawning a subprocess.
 *
 * Cursor config (~/.cursor/mcp.json):
 * {
 *   "mcpServers": {
 *     "lite-task": { "url": "http://localhost:8011/mcp" }
 *   }
 * }
 *
 * Stateless mode: a fresh Server + Transport is created per request.
 * No session management required.
 *
 * NOTE: MCP SDK is imported lazily inside handleMcp() to avoid Vite SSR crash
 * (ajv → json-schema-traverse is CommonJS and breaks Vite's ESM evaluator).
 * Tool definitions and handlers live in mcp/toolkit.ts (shared with
 * mcp/server.ts) — that module is SDK-free, so it's safe to import here.
 */

import { define } from "../utils.ts";
import { handleToolCall, TOOLS } from "../mcp/toolkit.ts";

// ---------------------------------------------------------------------------
// Fresh route handler — lazy MCP SDK import to avoid Vite SSR crash
// ---------------------------------------------------------------------------

async function handleMcp(req: Request): Promise<Response> {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { WebStandardStreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
  );
  const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
    "@modelcontextprotocol/sdk/types.js"
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = new Server(
    { name: "lite-task", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (mcpReq) => {
    const { name, arguments: args } = mcpReq.params;
    const a = (args ?? {}) as Record<string, unknown>;
    try {
      return await handleToolCall(name, a);
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}

export const handler = define.handlers({
  GET: (ctx) => handleMcp(ctx.req),
  POST: (ctx) => handleMcp(ctx.req),
  DELETE: (ctx) => handleMcp(ctx.req),
});

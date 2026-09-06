/**
 * Print the agent configuration to paste into the xAI Voice Agent Builder.
 *
 * Usage: deno task calls:tools
 *
 * The prompt and tools cannot be PATCHed onto the agent: `/v1/agents` and
 * `/v1/tools` answer 403 "agents endpoint is not enabled for this team", so the
 * repo keeps the definitions and this script emits them for the console. Re-run
 * it whenever APP_BASE_URL changes — the URLs embed it.
 *
 * Two ways to give the agent its tools, in order of preference:
 *
 *   1. MCP — one entry in the Builder ("Add custom MCP server") pointing at
 *      /mcp, authenticated with a header. Sixteen tools, and adding a tool to
 *      mcp/toolkit.ts is then all it takes for the agent to gain it.
 *   2. HTTP tools — nine hand-written, voice-shaped tools declared one by one.
 *      They take project and task *names* rather than ids, which suits speech;
 *      the MCP tools are id-based, so over MCP the agent lists first and acts
 *      second.
 */

import { buildHttpTools, buildVoiceTools } from "./tools.ts";
import { AGENT_TIMEZONE, GENERAL_PROMPT } from "./prompt.ts";

const appBaseUrl = Deno.env.get("APP_BASE_URL");
if (!appBaseUrl) {
  console.error("APP_BASE_URL is required (e.g. https://your-domain.com)");
  Deno.exit(1);
}

const token = Deno.env.get("VOICE_API_TOKEN");
const authHeader = token ? `Bearer ${token}` : "Bearer <VOICE_API_TOKEN>";

console.log("=== Agent timezone ===");
console.log(AGENT_TIMEZONE);
console.log("");

console.log("=== Prompt ===");
console.log(GENERAL_PROMPT);
console.log("");

console.log("=== Option 1: MCP server (recommended) ===");
console.log("In the Builder: Tools → Add custom MCP server");
console.log("");
console.log(`  Name:        lite-task`);
console.log(`  Server URL:  ${appBaseUrl}/mcp`);
console.log(`  Header:      Authorization: ${authHeader}   (mark as Secret)`);
console.log("");
console.log(
  `  Transport is Streamable HTTP, stateless — no session header needed.`,
);
console.log("");

console.log("=== Option 2: HTTP tools ===");
console.log(
  `Declare each tool below with URL ${appBaseUrl}/api/voice/tool, method POST,`,
);
console.log(`and the header  Authorization: ${authHeader}`);
console.log("");
console.log(JSON.stringify(buildHttpTools(appBaseUrl), null, 2));
console.log("");

console.log(
  `(${buildVoiceTools().length} HTTP tools; the MCP endpoint exposes more.)`,
);

if (!token) {
  console.log("");
  console.log(
    "! VOICE_API_TOKEN is unset, so /api/voice/* and /mcp accept requests from",
  );
  console.log(
    "  anyone who can reach the server. Set it and re-run this script.",
  );
}

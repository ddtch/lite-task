/**
 * Update Retell LLM tools URLs and agent webhook URL with new APP_BASE_URL.
 *
 * Usage: deno task calls:update-url
 */

import { buildRetellTools } from "./tools.ts";

const API_BASE = "https://api.retellai.com";
const API_KEY = Deno.env.get("RETELL_API_KEY");
const APP_BASE_URL = Deno.env.get("APP_BASE_URL");
const LLM_ID = Deno.env.get("RETELL_LLM_ID");
const AGENT_ID = Deno.env.get("RETELL_AGENT_ID");

if (!API_KEY || !APP_BASE_URL || !LLM_ID || !AGENT_ID) {
  console.error(
    "Required env vars: RETELL_API_KEY, APP_BASE_URL, RETELL_LLM_ID, RETELL_AGENT_ID",
  );
  Deno.exit(1);
}

// Update LLM tools with new base URL
const tools = buildRetellTools(APP_BASE_URL);
const llmRes = await fetch(`${API_BASE}/update-retell-llm/${LLM_ID}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ general_tools: tools }),
});

if (!llmRes.ok) {
  console.error(`Failed to update LLM: ${await llmRes.text()}`);
  Deno.exit(1);
}
console.log(`[update] LLM tools → ${APP_BASE_URL}/api/voice/tool`);

// Update agent webhook URL
const agentRes = await fetch(`${API_BASE}/update-agent/${AGENT_ID}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ webhook_url: `${APP_BASE_URL}/api/voice/webhook` }),
});

if (!agentRes.ok) {
  console.error(`Failed to update agent: ${await agentRes.text()}`);
  Deno.exit(1);
}
console.log(`[update] Agent webhook → ${APP_BASE_URL}/api/voice/webhook`);
console.log("[update] Done!");

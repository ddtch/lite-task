/**
 * Voice setup check — reports what the xAI account exposes to this app.
 *
 * Usage: deno task calls:setup
 *
 * There is nothing to create here: the agent lives in the xAI Voice Agent
 * Builder
 * (console.x.ai → Voice → Agents), and the `/v1/agents` API answers 403
 * "agents endpoint is not enabled for this team". So this script verifies the
 * key, shows how each number is routed, and says plainly which pieces the app
 * can drive over the API and which have to be configured in the console.
 *
 * Requires: XAI_API_KEY. Optional: XAI_AGENT_ID, APP_BASE_URL.
 */

import { listPhoneNumbers } from "./xai.ts";
import { AGENT_TIMEZONE } from "./prompt.ts";

if (!Deno.env.get("XAI_API_KEY")) {
  console.error("XAI_API_KEY is required");
  Deno.exit(1);
}

const agentId = Deno.env.get("XAI_AGENT_ID");
const appBaseUrl = Deno.env.get("APP_BASE_URL");
const voiceToken = Deno.env.get("VOICE_API_TOKEN");
const authHeader = voiceToken
  ? `Bearer ${voiceToken}`
  : "Bearer <VOICE_API_TOKEN>";

console.log(`[setup] Agent timezone: ${AGENT_TIMEZONE} (from TZ)`);
console.log("");

const numbers = await listPhoneNumbers();
if (numbers.length === 0) {
  console.log("[setup] No phone numbers on this account.");
  console.log(
    "        Provision one in console.x.ai → Voice, or register a BYO SIP number.",
  );
} else {
  console.log(`[setup] ${numbers.length} phone number(s):`);
  for (const n of numbers) {
    const route = n.agent_id
      ? `agent ${n.agent_id}${n.agent_name ? ` (${n.agent_name})` : ""}`
      : n.webhook_id
      ? `webhook ${n.webhook_id}`
      : "nothing — inbound calls will not be answered";
    console.log(`  ${n.phone_number}  ${n.name}`);
    console.log(`    origin: ${n.origin}, routes to: ${route}`);
  }
}
console.log("");

if (agentId) {
  const bound = numbers.find((n) => n.agent_id === agentId);
  console.log(
    bound
      ? `[setup] XAI_AGENT_ID is bound to ${bound.phone_number} — inbound calls reach it.`
      : `[setup] XAI_AGENT_ID ${agentId} is not bound to any number on this account.`,
  );
} else {
  console.log(
    "[setup] XAI_AGENT_ID is not set — outbound reminder calls are disabled.",
  );
}

console.log("");
console.log(
  "Configure in the Voice Agent Builder (not available over the API):",
);
console.log("  - prompt and timezone: deno task calls:tools prints both");
console.log("  - tools, either way (deno task calls:tools prints both forms):");
console.log(`      MCP server  ${appBaseUrl ?? "<APP_BASE_URL>"}/mcp`);
console.log(
  `      HTTP tools  ${appBaseUrl ?? "<APP_BASE_URL>"}/api/voice/tool`,
);
console.log("  - webhook (optional, for call logging):");
console.log(`      ${appBaseUrl ?? "<APP_BASE_URL>"}/api/voice/webhook`);
console.log(`  - header on all of the above: Authorization: ${authHeader}`);
if (!voiceToken) {
  console.log("");
  console.log(
    "  ! VOICE_API_TOKEN is unset — those routes accept requests from anyone.",
  );
}

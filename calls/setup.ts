/**
 * One-time setup script — creates Retell LLM + Agent.
 *
 * Usage: deno task calls:setup
 *
 * Requires env vars: RETELL_API_KEY, APP_BASE_URL
 * Outputs: RETELL_AGENT_ID, RETELL_LLM_ID to add to .env
 */

import { createRetellAgent, createRetellLlm } from "./retell.ts";
import { buildRetellTools } from "./tools.ts";
import { BEGIN_MESSAGE, GENERAL_PROMPT } from "./prompt.ts";

const APP_BASE_URL = Deno.env.get("APP_BASE_URL");
if (!APP_BASE_URL) {
  console.error("APP_BASE_URL is required (e.g. https://your-domain.com)");
  Deno.exit(1);
}

if (!Deno.env.get("RETELL_API_KEY")) {
  console.error("RETELL_API_KEY is required");
  Deno.exit(1);
}

console.log(`[setup] Creating Retell LLM with tools pointing to ${APP_BASE_URL}...`);

const tools = buildRetellTools(APP_BASE_URL);

const llm = await createRetellLlm({
  generalPrompt: GENERAL_PROMPT,
  beginMessage: BEGIN_MESSAGE,
  tools,
});

console.log(`[setup] Created LLM: ${llm.llm_id}`);

console.log("[setup] Creating Retell Agent...");

const agent = await createRetellAgent({
  llmId: llm.llm_id,
  agentName: "lite-task-voice",
  language: "multi",
  webhookUrl: `${APP_BASE_URL}/api/voice/webhook`,
});

console.log(`[setup] Created Agent: ${agent.agent_id}`);
console.log("");
console.log("Add these to your .env file:");
console.log(`RETELL_AGENT_ID=${agent.agent_id}`);
console.log(`RETELL_LLM_ID=${llm.llm_id}`);
console.log("");
console.log(
  `Next: bind agent ${agent.agent_id} to your phone number in the Retell dashboard.`,
);

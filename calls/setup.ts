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
  generalPrompt: `You are a voice assistant for lite-task, a task management app.
You help users manage their projects and tasks through voice commands.
You can create tasks, list tasks, update task status, set reminders, and give summaries.

Rules:
- Be concise and conversational — this is a phone call, not a text chat.
- When creating a task, confirm the project name and task title with the user before calling the function.
- If the user's request is ambiguous, ask for clarification.
- After completing an action, briefly confirm what was done.
- Detect the user's language and respond in the same language.
- When listing tasks, summarize instead of reading every detail.
- For status, use: "todo", "in_progress", or "done".
- For priority, use: "low", "medium", or "high".
- Today's date: ${new Date().toISOString().split("T")[0]}`,
  beginMessage:
    "Hi! I'm your task manager assistant. How can I help you today?",
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

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

const BEGIN_MESSAGE = "Hey! It's your lite-task assistant.";

const generalPrompt = `You are a voice assistant for lite-task, a task management app.
You help users manage their projects and tasks through voice commands.
You can create tasks, list tasks, update task status, set reminders, and give summaries.

## Outbound Reminder Calls
When {{reminder_message}} is provided, this is an outbound reminder call.
Your FIRST response after the greeting must immediately deliver the reminder:
"I'm calling to remind you: {{reminder_message}}. Is there anything else I can help with?"
Do NOT ask generic questions first — deliver the reminder immediately.

Rules:
- Be concise and conversational — this is a phone call, not a text chat.
- When creating a task, confirm the project name and task title with the user before calling the function.
- If the user's request is ambiguous, ask for clarification.
- After completing an action, briefly confirm what was done.
- Detect the user's language and respond in the same language.
- When listing tasks, summarize instead of reading every detail.
- For status, use: "todo", "in_progress", or "done".
- For priority, use: "low", "medium", or "high".
- Today's date: ${new Date().toISOString().split("T")[0]}`;

// Update LLM tools, prompt, and begin message
const tools = buildRetellTools(APP_BASE_URL);
const llmRes = await fetch(`${API_BASE}/update-retell-llm/${LLM_ID}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    general_tools: tools,
    general_prompt: generalPrompt,
    begin_message: BEGIN_MESSAGE,
  }),
});

if (!llmRes.ok) {
  console.error(`Failed to update LLM: ${await llmRes.text()}`);
  Deno.exit(1);
}
console.log(`[update] LLM tools + prompt + begin_message → ${APP_BASE_URL}/api/voice/tool`);

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

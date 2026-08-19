/**
 * Push the current prompt, tools and webhook URL to the live Retell agent.
 *
 * Usage: deno task calls:update-url
 *
 * Retell versions are immutable once published: PATCHing a published agent or
 * LLM fails with "Cannot update published agent/LLM". So this script works on a
 * draft — reusing the current one if the latest version is still unpublished,
 * otherwise forking a new draft off it — edits that draft, then publishes it.
 */

import { buildRetellTools } from "./tools.ts";
import {
  AGENT_TIMEZONE,
  BEGIN_MESSAGE,
  DEFAULT_DYNAMIC_VARIABLES,
  GENERAL_PROMPT,
} from "./prompt.ts";

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

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    console.error(`Failed: ${method} ${path} (${res.status})`);
    console.error(await res.text());
    Deno.exit(1);
  }
  // Some endpoints (publish) answer 2xx with an empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

interface AgentVersion {
  version: number;
  is_published: boolean;
  response_engine: { llm_id: string; version: number };
}

// 1. Find a draft to edit, forking one off the published version if needed.
const current = await call<AgentVersion>("GET", `/get-agent/${AGENT_ID}`);
let draft = current;

if (current.is_published) {
  console.log(
    `[update] Agent v${current.version} is published — creating a new draft from it`,
  );
  draft = await call<AgentVersion>(
    "POST",
    `/create-agent-version/${AGENT_ID}`,
    { base_version: current.version },
  );
}

const agentVersion = draft.version;
const llmVersion = draft.response_engine.version;
console.log(
  `[update] Editing draft: agent v${agentVersion}, LLM v${llmVersion}`,
);

// 2. Prompt, tools and the per-call opening line.
await call("PATCH", `/update-retell-llm/${LLM_ID}?version=${llmVersion}`, {
  general_tools: buildRetellTools(APP_BASE_URL),
  general_prompt: GENERAL_PROMPT,
  // The opening line is a dynamic variable the backend composes per call, so a
  // reminder call states its reason in the first sentence instead of greeting.
  begin_message: BEGIN_MESSAGE,
  default_dynamic_variables: DEFAULT_DYNAMIC_VARIABLES,
});
console.log(`[update] LLM prompt + tools → ${APP_BASE_URL}/api/voice/tool`);

// 3. Webhook URL and timezone. The agent's own timezone must match the
// {{current_time_<IANA>}} built-in in the prompt — left unset, Retell assumes
// America/Los_Angeles and the model reasons about dates in the wrong zone.
await call("PATCH", `/update-agent/${AGENT_ID}?version=${agentVersion}`, {
  webhook_url: `${APP_BASE_URL}/api/voice/webhook`,
  timezone: AGENT_TIMEZONE,
});
console.log(`[update] Agent webhook → ${APP_BASE_URL}/api/voice/webhook`);
console.log(`[update] Agent timezone → ${AGENT_TIMEZONE}`);

// 4. Outbound calls use the published version, so the draft must be published.
await call("POST", `/publish-agent-version/${AGENT_ID}`, {
  version: agentVersion,
});
console.log(`[update] Published agent v${agentVersion}`);
console.log("[update] Done!");

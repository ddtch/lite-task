/**
 * Retell AI API client — fetch-based, no SDK dependency.
 *
 * Exposes helpers for creating LLMs, agents, web calls, and outbound phone calls.
 */

const API_BASE = "https://api.retellai.com";

function getApiKey(): string {
  const key = Deno.env.get("RETELL_API_KEY");
  if (!key) throw new Error("RETELL_API_KEY not set");
  return key;
}

async function retellFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Retell API ${path} (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetellTool {
  type: "custom";
  name: string;
  description: string;
  url: string;
  method: "POST";
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  speak_during_execution?: boolean;
  speak_after_execution?: boolean;
  timeout_ms?: number;
}

export interface RetellLlm {
  llm_id: string;
  version: number;
  is_published: boolean;
  last_modification_timestamp: number;
}

export interface RetellAgent {
  agent_id: string;
  version: number;
  agent_name: string;
  voice_id: string;
  is_published: boolean;
  last_modification_timestamp: number;
}

export interface WebCallResponse {
  call_id: string;
  access_token: string;
  agent_id: string;
  call_status: string;
}

export interface PhoneCallResponse {
  call_id: string;
  agent_id: string;
  call_status: string;
  from_number: string;
  to_number: string;
  direction: string;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export async function createRetellLlm(opts: {
  generalPrompt: string;
  beginMessage: string;
  tools: RetellTool[];
  model?: string;
}): Promise<RetellLlm> {
  return retellFetch<RetellLlm>("/create-retell-llm", {
    body: {
      model: opts.model ?? "claude-4.6-sonnet",
      general_prompt: opts.generalPrompt,
      general_tools: opts.tools,
      begin_message: opts.beginMessage,
    },
  });
}

export async function createRetellAgent(opts: {
  llmId: string;
  voiceId?: string;
  agentName?: string;
  language?: string;
  webhookUrl?: string;
}): Promise<RetellAgent> {
  return retellFetch<RetellAgent>("/create-agent", {
    body: {
      response_engine: {
        type: "retell-llm",
        llm_id: opts.llmId,
      },
      voice_id: opts.voiceId ?? "retell-Cimo",
      agent_name: opts.agentName ?? "lite-task-voice",
      language: opts.language ?? "multi",
      ...(opts.webhookUrl ? { webhook_url: opts.webhookUrl } : {}),
    },
  });
}

export async function createWebCall(agentId: string): Promise<WebCallResponse> {
  return retellFetch<WebCallResponse>("/v2/create-web-call", {
    body: { agent_id: agentId },
  });
}

export async function createPhoneCall(opts: {
  fromNumber: string;
  toNumber: string;
  agentId?: string;
  dynamicVariables?: Record<string, string>;
}): Promise<PhoneCallResponse> {
  return retellFetch<PhoneCallResponse>("/v2/create-phone-call", {
    body: {
      from_number: opts.fromNumber,
      to_number: opts.toNumber,
      ...(opts.agentId ? { override_agent_id: opts.agentId } : {}),
      ...(opts.dynamicVariables
        ? { retell_llm_dynamic_variables: opts.dynamicVariables }
        : {}),
    },
  });
}

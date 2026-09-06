/**
 * xAI voice API client — fetch-based, no SDK dependency.
 *
 * Covers the endpoints this app needs: phone-number configuration, ephemeral
 * client secrets, in-call control (refer/hangup) and outbound call placement.
 *
 * What is verified against the live API (August 2026) and what is not:
 *
 *   GET/PATCH /v2/phone-numbers        verified
 *   POST /v1/realtime/client_secrets   verified
 *   POST /v1/realtime/calls/{id}/refer verified (400 "invalid call_id" on a fake id)
 *   POST /v1/realtime/calls/{id}/hangup verified (same)
 *   GET/POST /v1/agents, /v1/tools     exist but answer 403
 *                                      "agents endpoint is not enabled for this team"
 *
 * Outbound call placement belongs to that same gated Voice Agent Builder API,
 * so `placeOutboundCall()` posts to a path that is configurable via
 * XAI_OUTBOUND_PATH rather than hardcoded: when xAI enables the agents API for
 * the team (or publishes the endpoint), only that env var has to change. The
 * error thrown carries xAI's own response text so a 403 is visible in the
 * scheduler logs instead of being silently swallowed.
 */

const API_BASE = "https://api.x.ai";

/** Path that places an outbound call. Overridable — see the module comment. */
const OUTBOUND_PATH = Deno.env.get("XAI_OUTBOUND_PATH") ??
  "/v1/realtime/calls";

function getApiKey(): string {
  const key = Deno.env.get("XAI_API_KEY");
  if (!key) throw new Error("XAI_API_KEY not set");
  return key;
}

async function xaiFetch<T>(
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
    throw new Error(`xAI API ${path} (${res.status}): ${text}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XaiPhoneNumber {
  phone_number_id: string;
  team_id: string;
  phone_number: string;
  name: string;
  /** Set when the number routes to a Voice Agent Builder agent. */
  agent_id?: string;
  agent_name?: string;
  /** Set when the number dispatches realtime.call.incoming to a webhook. */
  webhook_id?: string;
  origin: "xai_provisioned" | "byo_trunk";
  sip_host: string;
  inbound_trunk_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ClientSecret {
  value: string;
  expires_at: number;
}

export interface OutboundCall {
  call_id: string;
}

// ---------------------------------------------------------------------------
// Phone numbers
// ---------------------------------------------------------------------------

export async function listPhoneNumbers(): Promise<XaiPhoneNumber[]> {
  const data = await xaiFetch<{ phone_numbers: XaiPhoneNumber[] }>(
    "/v2/phone-numbers",
    { method: "GET" },
  );
  return data.phone_numbers ?? [];
}

/**
 * Update a phone number.
 *
 * The body is a protobuf-style FieldMask update: `paths` names the fields to
 * write and `fields` carries the values, nested under `phone_number`. Only
 * `name`, `agent_id`, `webhook_id` and `outbound_sms_enabled` are updatable.
 *
 * A path listed in the mask with no matching value CLEARS that field — listing
 * `agent_id` without supplying one unbinds the agent from the number.
 */
export async function updatePhoneNumber(
  phoneNumberId: string,
  fields: Partial<Pick<XaiPhoneNumber, "name" | "agent_id" | "webhook_id">>,
  paths: string[],
): Promise<XaiPhoneNumber> {
  const data = await xaiFetch<{ phone_number: XaiPhoneNumber }>(
    `/v2/phone-numbers/${phoneNumberId}`,
    {
      method: "PATCH",
      body: { phone_number: fields, field_mask: { paths } },
    },
  );
  return data.phone_number;
}

// ---------------------------------------------------------------------------
// Realtime sessions and call control
// ---------------------------------------------------------------------------

/** Short-lived token so a client can open a realtime WebSocket without the key. */
export function createClientSecret(
  expiresInSeconds = 300,
): Promise<ClientSecret> {
  return xaiFetch<ClientSecret>("/v1/realtime/client_secrets", {
    body: { expires_after: { seconds: expiresInSeconds } },
  });
}

/** Transfer a live call to another PSTN or SIP destination. */
export async function referCall(
  callId: string,
  targetUri: string,
): Promise<void> {
  await xaiFetch(`/v1/realtime/calls/${callId}/refer`, {
    body: { target_uri: targetUri },
  });
}

/** End a live call. */
export async function hangupCall(callId: string): Promise<void> {
  await xaiFetch(`/v1/realtime/calls/${callId}/hangup`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Outbound calls
// ---------------------------------------------------------------------------

/**
 * Place an outbound call from the configured agent.
 *
 * `variables` are the per-call context values the agent's prompt references —
 * the composed opening line above all (see calls/context.ts), so a reminder
 * call states its reason in its first sentence rather than greeting generically.
 */
export function placeOutboundCall(opts: {
  toNumber: string;
  agentId: string;
  fromNumber?: string;
  variables?: Record<string, string>;
}): Promise<OutboundCall> {
  return xaiFetch<OutboundCall>(OUTBOUND_PATH, {
    body: {
      agent_id: opts.agentId,
      to_number: opts.toNumber,
      ...(opts.fromNumber ? { from_number: opts.fromNumber } : {}),
      ...(opts.variables ? { variables: opts.variables } : {}),
    },
  });
}

/** True when the env carries everything `placeOutboundCall()` needs. */
export function outboundConfigured(): boolean {
  return Boolean(Deno.env.get("XAI_API_KEY") && Deno.env.get("XAI_AGENT_ID"));
}

/**
 * xAI voice webhook.
 *
 * Receives `realtime.call.incoming` when someone dials a number that dispatches
 * to a webhook instead of straight to a Builder agent, plus any call lifecycle
 * events xAI sends for a call this app placed.
 *
 * Payload shape:
 *   { object, id, type, created_at, data: { call_id, sip_headers, metadata } }
 *
 * Events are signed with Standard Webhooks v1 headers (webhook-id,
 * webhook-timestamp, webhook-signature) using the signing secret xAI returns
 * once, when the number is registered. Set XAI_WEBHOOK_SECRET to have them
 * verified; without it the route still works but accepts unsigned posts, which
 * is only reasonable on a non-public host.
 */

import { define } from "../../../utils.ts";
import { createCallLog, updateCallLog } from "../../../db/queries.ts";

const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Standard Webhooks v1: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
async function verifySignature(
  secret: string,
  headers: Headers,
  body: string,
): Promise<boolean> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;

  // Reject replays of an old, validly signed delivery.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // The header carries a space-separated list of `v1,<signature>` pairs so a
  // secret can be rotated without dropping deliveries.
  return signature.split(" ").some((part) => part.split(",")[1] === expected);
}

interface WebhookEvent {
  type: string;
  data?: {
    call_id?: string;
    sip_headers?: Array<{ name: string; value: string }>;
    metadata?: Record<string, unknown>;
    call_status?: string;
    duration_ms?: number;
    transcript?: unknown;
    disconnection_reason?: string;
    start_timestamp?: number;
    end_timestamp?: number;
  };
}

function sipHeader(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string,
): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value ?? "";
}

export const handler = define.handlers({
  async POST(ctx) {
    const raw = await ctx.req.text();

    const secret = Deno.env.get("XAI_WEBHOOK_SECRET");
    if (secret && !await verifySignature(secret, ctx.req.headers, raw)) {
      console.warn("[voice/webhook] Rejected: bad signature");
      return new Response(null, { status: 401 });
    }

    let body: WebhookEvent;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 400 });
    }

    const data = body.data ?? {};
    const callId = String(data.call_id ?? "");
    if (!callId) return new Response(null, { status: 400 });

    try {
      switch (body.type) {
        case "realtime.call.incoming":
          await createCallLog({
            call_id: callId,
            call_type: "phone_call",
            direction: "inbound",
            from_number: sipHeader(data.sip_headers, "From"),
            to_number: sipHeader(data.sip_headers, "To"),
            call_status: "ongoing",
          });
          break;

        default:
          // Any later lifecycle event for a call already in the log.
          await updateCallLog(callId, {
            call_status: data.call_status,
            started_at: data.start_timestamp
              ? new Date(Number(data.start_timestamp)).toISOString()
              : undefined,
            ended_at: data.end_timestamp
              ? new Date(Number(data.end_timestamp)).toISOString()
              : undefined,
            transcript: data.transcript
              ? JSON.stringify(data.transcript)
              : undefined,
            disconnection_reason: data.disconnection_reason,
            duration_seconds: data.duration_ms
              ? Math.round(Number(data.duration_ms) / 1000)
              : undefined,
          });
          break;
      }
    } catch (err) {
      console.error(`[voice/webhook] Error processing ${body.type}:`, err);
    }

    return new Response(null, { status: 204 });
  },
});

/**
 * Retell event webhook — receives call lifecycle events.
 *
 * Events: call_started, call_ended, call_analyzed
 */

import { define } from "../../../utils.ts";
import { updateCallLog } from "../../../db/queries.ts";

export const handler = define.handlers({
  async POST(ctx) {
    let body: { event: string; call: Record<string, unknown> };
    try {
      body = await ctx.req.json();
    } catch {
      return new Response(null, { status: 400 });
    }

    const { event, call } = body;
    const callId = String(call.call_id ?? "");
    if (!callId) return new Response(null, { status: 400 });

    try {
      switch (event) {
        case "call_started":
          await updateCallLog(callId, {
            call_status: "ongoing",
            started_at: call.start_timestamp
              ? new Date(Number(call.start_timestamp)).toISOString()
              : undefined,
          });
          break;

        case "call_ended":
          await updateCallLog(callId, {
            call_status: "ended",
            ended_at: call.end_timestamp
              ? new Date(Number(call.end_timestamp)).toISOString()
              : undefined,
            transcript: call.transcript
              ? JSON.stringify(call.transcript)
              : undefined,
            disconnection_reason: call.disconnection_reason
              ? String(call.disconnection_reason)
              : undefined,
            duration_seconds: call.duration_ms
              ? Math.round(Number(call.duration_ms) / 1000)
              : undefined,
          });
          break;

        case "call_analyzed":
          // call_analyzed comes after call_ended with analysis data
          // We could store this in a metadata field if needed
          break;
      }
    } catch (err) {
      console.error(`[voice/webhook] Error processing ${event}:`, err);
    }

    return new Response(null, { status: 204 });
  },
});

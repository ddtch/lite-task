/**
 * Place one real outbound call, right now, to check the phone path end to end.
 *
 * Usage: deno task calls:test            → calls REMINDER_TO_NUMBER
 *        deno task calls:test +15551234  → calls that number instead
 *
 * This is the same code path a due reminder takes — `placeOutboundCall()` with
 * a context built by `buildCallContext()` — so whatever it reports here is what
 * the schedulers will hit at 08:00. It exists because "no call arrived" has
 * several possible causes (no agent id, wrong number, the API refusing) and
 * waiting for a reminder to come due is a slow way to tell them apart.
 *
 * Requires: XAI_API_KEY, XAI_AGENT_ID and a destination number.
 */

import { placeOutboundCall } from "./xai.ts";
import { buildCallContext } from "./context.ts";
import { AGENT_TIMEZONE } from "./prompt.ts";

const apiKey = Deno.env.get("XAI_API_KEY");
const agentId = Deno.env.get("XAI_AGENT_ID");
const fromNumber = Deno.env.get("XAI_FROM_NUMBER");
const toNumber = Deno.args[0] ?? Deno.env.get("REMINDER_TO_NUMBER");

const missing = [
  ["XAI_API_KEY", apiKey],
  ["XAI_AGENT_ID", agentId],
  ["REMINDER_TO_NUMBER (or an argument)", toNumber],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length > 0) {
  console.error(`Missing: ${missing.join(", ")}`);
  Deno.exit(1);
}

console.log(`[test-call] agent:    ${agentId}`);
console.log(`[test-call] from:     ${fromNumber ?? "(agent default)"}`);
console.log(`[test-call] to:       ${toNumber}`);
console.log(`[test-call] timezone: ${AGENT_TIMEZONE}`);
console.log("[test-call] placing the call...");

try {
  const call = await placeOutboundCall({
    toNumber: toNumber!,
    agentId: agentId!,
    fromNumber,
    variables: buildCallContext({
      mode: "reminder",
      summary: "this is a test call from lite-task, nothing is actually due",
      details:
        "The user triggered this from the command line to check that outbound calling works. There is no real reminder behind it.",
    }),
  });
  console.log(`[test-call] accepted — call_id ${call.call_id}`);
  console.log("[test-call] your phone should ring shortly.");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[test-call] REFUSED: ${msg}`);
  if (msg.includes("403")) {
    console.error("");
    console.error(
      "  A 403 here is the account, not the code: outbound calling belongs to",
    );
    console.error(
      "  the Voice Agent Builder API, which is enabled per team. Ask xAI to turn",
    );
    console.error(
      "  it on, or set XAI_OUTBOUND_PATH if they publish a different endpoint.",
    );
  }
  Deno.exit(1);
}

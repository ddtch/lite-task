/**
 * Per-call dynamic context for the Retell LLM prompt.
 *
 * The Retell general_prompt and begin_message are set once at LLM creation and
 * stay static. Everything that varies per call — today's date, and above all the
 * reason the agent is calling — is passed as retell_llm_dynamic_variables and
 * referenced from the prompt as {{current_date}}, {{call_opening}}, etc.
 *
 * buildCallContext() is the single place the spoken opening line is composed, so
 * every outbound call states its purpose in its very first sentence.
 */

import { AGENT_TIMEZONE } from "./prompt.ts";

export function buildDateContext(): Record<string, string> {
  // Same constant the prompt's {{current_time_<IANA>}} anchor and the agent's
  // own timezone setting are built from, so all three agree.
  const tz = AGENT_TIMEZONE;
  const now = new Date();

  const current_date = now.toLocaleDateString("en-CA", { timeZone: tz });
  const current_time = now.toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const day_of_week = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(now);

  return {
    current_date,
    current_time,
    current_datetime: `${current_date} ${current_time}`,
    day_of_week,
    timezone: tz,
  };
}

export interface CallReason {
  /** Why the agent is calling, as a lower-case clause with no trailing period —
   *  e.g. `your event "Lunch" starts in 10 minutes`. Goes straight into speech. */
  summary: string;
  /** Extra facts the agent can draw on later in the call. */
  details: string;
  /** Which kind of outbound call this is. */
  mode: "reminder" | "event_reminder";
  /** Identifiers and labels passed through for the agent's tool calls. */
  extra?: Record<string, string>;
}

/**
 * Full dynamic-variable set for an outbound call, including the composed
 * {{call_opening}} the agent speaks first.
 */
export function buildCallContext(reason: CallReason): Record<string, string> {
  const summary = reason.summary.replace(/\.\s*$/, "");
  return {
    ...buildDateContext(),
    outbound_mode: reason.mode,
    call_opening:
      `Hi! It's your lite-task assistant — quick reminder: ${summary}.`,
    call_reason: summary,
    // Kept under the original names so existing prompt versions still resolve.
    reminder_message: summary,
    reminder_context: reason.details,
    ...reason.extra,
  };
}

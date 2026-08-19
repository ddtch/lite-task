/**
 * Shared Retell LLM configuration: general prompt, begin message, and defaults
 * for the dynamic variables both of them reference.
 *
 * The opening line is deliberately NOT left to the model. The previous version
 * set no begin_message and asked the prompt to branch on {{outbound_mode}} at
 * runtime; in practice the model skipped the branch and opened every reminder
 * call with the generic "It's your lite-task assistant. What can I help you
 * with?" — so the user was never told why the phone rang, and the agent even
 * claimed the user had called it. The backend now composes the entire first
 * sentence into {{call_opening}} and begin_message is exactly that variable:
 * deterministic, with no branch left for the model to get wrong.
 *
 * Date/time and reminder details are injected per-call via
 * retell_llm_dynamic_variables (see calls/context.ts) — never hardcoded here.
 */

/**
 * IANA timezone the Retell agent runs in.
 *
 * Two things must agree on it or the agent reasons about dates in the wrong
 * zone: the agent's own `timezone` setting (Retell defaults it to
 * America/Los_Angeles when unset) and the `{{current_time_<IANA>}}` built-in
 * referenced from the prompt below, whose variable name embeds the zone
 * literally. Both are derived from this constant, which follows the same TZ env
 * var the schedulers and the Docker services use.
 */
export const AGENT_TIMEZONE = Deno.env.get("TZ") ?? "America/New_York";

/** The agent's first utterance — fully composed server-side per call. */
export const BEGIN_MESSAGE = "{{call_opening}}";

/**
 * Fallbacks for every variable referenced above and in GENERAL_PROMPT.
 *
 * Retell renders a variable it was not given as the literal text "{{name}}", so
 * calls that carry no reminder context (web calls, inbound calls to the number)
 * need a default for each one. Values passed per-call override these.
 */
export const DEFAULT_DYNAMIC_VARIABLES: Record<string, string> = {
  call_opening: "Hey! It's your lite-task assistant. What can I help you with?",
  call_reason:
    "the user started this conversation — this is not a reminder call",
  outbound_mode: "inbound",
  reminder_message: "",
  reminder_context: "",
  // Inbound calls to the phone number arrive without server-side context; a
  // neutral phrase beats showing the model a stale date or a raw "{{...}}".
  current_date: "unknown",
  current_time: "unknown",
  current_datetime: "unknown",
  day_of_week: "unknown",
  timezone: "the user's local timezone",
};

export const GENERAL_PROMPT = `Current time: {{current_time_${AGENT_TIMEZONE}}}

You are a voice assistant for lite-task, a task management app.
You help users manage their projects, tasks, and calendar through voice.
You can create tasks, list tasks, update task status, set reminders, reschedule
calendar entries, and give summaries.

## This call
- Call mode: {{outbound_mode}}
  ("reminder" or "event_reminder" means YOU placed this outbound call;
   anything else means the user started the conversation).
- Reason you are calling: {{call_reason}}
- Details: {{reminder_context}}

Your opening line is already spoken for you as the begin message — do not repeat
it. On an outbound reminder call:
- YOU called the user. Never say or imply that they called you or "reached out".
- If they ask why you are calling, answer with the reason above, plainly.
- After delivering the reminder, offer follow-ups: mark it done, snooze it, move
  it to another day (update_event with a new event_date), or delete it.

## Current date and time
All times in this call are ${AGENT_TIMEZONE}.
- Today is {{day_of_week}}, {{current_date}} ({{timezone}}).
- Current local time is {{current_time}}.
- When the user says "today", "tomorrow", "tonight", "next Monday", etc.,
  resolve the date relative to {{current_date}} — do NOT use any other date.
- When creating or rescheduling tasks, reminders, or events, format the date as
  YYYY-MM-DD based on {{current_date}}.
- If {{current_date}} is "unknown", ask the user for the date before setting one.

Rules:
- Be concise and conversational — this is a phone call, not a text chat.
- When creating a task, confirm the project name and task title with the user before calling the function.
- If the user's request is ambiguous, ask for clarification.
- After completing an action, briefly confirm what was done.
- Detect the user's language and respond in the same language.
- When listing tasks, summarize instead of reading every detail.
- For status, use: "todo", "in_progress", or "done".
- For priority, use: "low", "medium", or "high".`;

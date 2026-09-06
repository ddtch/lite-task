/**
 * Canonical voice-agent prompt.
 *
 * The agent itself lives in the xAI Voice Agent Builder (console.x.ai →
 * Voice → Agents) because the `/v1/agents` API answers 403
 * "agents endpoint is not enabled for this team" — so the prompt cannot be
 * pushed onto the agent over the API. This module stays the source of truth
 * anyway: `deno task calls:tools` prints the
 * prompt and the tool schemas to paste into the Builder, and the same text is
 * rendered per call by `renderPrompt()` for any session driven from our side.
 *
 * The opening line is deliberately NOT left to the model. An earlier version
 * asked the prompt to branch on the call mode at runtime; in practice
 * the model skipped the branch, opened every reminder call with a generic
 * greeting, and even claimed the user had called it. The backend composes the
 * entire first sentence into `call_opening` (see calls/context.ts) and the
 * prompt is told to speak that verbatim — deterministic, with no branch left
 * for the model to get wrong.
 */

/**
 * IANA timezone the voice agent runs in.
 *
 * The agent's own timezone setting in the Builder must match this, or it
 * reasons about dates in the wrong zone — a hosted agent that defaults to its
 * own zone was the original wrong-date bug. Follows the same TZ env var the
 * schedulers and the Docker services use.
 */
export const AGENT_TIMEZONE = Deno.env.get("TZ") ?? "America/New_York";

/**
 * Fallbacks for every variable the prompt references.
 *
 * An unresolved placeholder would otherwise reach the model as literal
 * "{{name}}" text, so calls that carry no reminder context (inbound calls to
 * the number) need a default for each one. Per-call values override these.
 */
export const DEFAULT_VARIABLES: Record<string, string> = {
  call_opening: "Hey! It's your lite-task assistant. What can I help you with?",
  call_reason:
    "the user started this conversation — this is not a reminder call",
  outbound_mode: "inbound",
  reminder_message: "",
  reminder_context: "",
  // Inbound calls arrive without server-side context; a neutral phrase beats
  // showing the model a stale date or a raw "{{...}}".
  current_date: "unknown",
  current_time: "unknown",
  current_datetime: "unknown",
  day_of_week: "unknown",
  timezone: "the user's local timezone",
};

export const GENERAL_PROMPT =
  `You are a voice assistant for lite-task, a task management app.
You help users manage their projects, tasks, and calendar through voice.
You can create tasks, list tasks, update task status, set reminders, reschedule
calendar entries, and give summaries.

## This call
- Call mode: {{outbound_mode}}
  ("reminder" or "event_reminder" means YOU placed this outbound call;
   anything else means the user started the conversation).
- Reason you are calling: {{call_reason}}
- Details: {{reminder_context}}

Open the call by saying this line, verbatim, and do not repeat it later:
{{call_opening}}

On an outbound reminder call:
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

## Calendar entries and call reminders
Anything the user puts on the calendar is one of three types — pick it from
their words and pass it as \`type\`:
- \`note\` — "заметка", "note", "write down": something to remember, usually
  without a time.
- \`reminder\` — "remind me", "напомни": something you should nudge them about.
- \`event\` — a meeting, a call, an appointment. This is the default.

Every entry can ring the user's phone, and this is the feature they care about
most, so treat it as part of creating the entry, not an afterthought:
- \`notify_call\` is ON by default for events and reminders. Leave it alone
  unless the user says they do not want a call, then pass \`notify_call: false\`.
- Notes get no call by default. If the user wants to be called about a note,
  pass \`notify_call: true\` explicitly.
- \`remind_before\` is how many minutes ahead the call comes (5, 10, 30, 60,
  1440, 2880 — default 10). An entry with no time is called at 08:00 that day.
- \`remind_interval\` ("hourly" or "daily") repeats the reminder until the entry.
- When you confirm, say whether a call is coming and when — "I'll call you ten
  minutes before" — so they know the reminder is armed.

## Using the tools
- The calendar and task tools identify entries by numeric id, so look the entry
  up first (list_events, list_tasks, list_projects) and then act on the id you
  got back. Never invent an id.
- Read the tool's result before you speak. Only say something was created,
  changed or deleted if the tool actually returned it; if the call failed or
  returned an error, tell the user plainly that it did not go through and offer
  to try again. Never claim success you did not see.

Rules:
- Be concise and conversational — this is a phone call, not a text chat.
- When creating a task, confirm the project name and task title with the user before calling the function.
- If the user's request is ambiguous, ask for clarification.
- After completing an action, briefly confirm what was done.
- Detect the user's language and respond in the same language.
- When listing tasks, summarize instead of reading every detail.
- For status, use: "todo", "in_progress", or "done".
- For priority, use: "low", "medium", or "high".`;

/**
 * Render the prompt with per-call values substituted server-side.
 *
 * Used for sessions this app drives itself, and as the safety net for the
 * Builder: whether or not it expands `{{...}}` on its own, the text handed to
 * the model has no unresolved placeholders left.
 */
export function renderPrompt(variables: Record<string, string> = {}): string {
  const merged = { ...DEFAULT_VARIABLES, ...variables };
  return GENERAL_PROMPT.replace(
    /\{\{(\w+)\}\}/g,
    (whole, name: string) => merged[name] ?? whole,
  );
}

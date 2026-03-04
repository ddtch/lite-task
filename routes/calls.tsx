import { page } from "fresh";
import { define } from "../utils.ts";
import {
  listCallLogs,
  listReminders,
  type CallLog,
  type Reminder,
} from "../db/queries.ts";
import WebCall from "../islands/WebCall.tsx";

export const handler = define.handlers({
  async GET() {
    const [calls, reminders] = await Promise.all([
      listCallLogs(20),
      listReminders(),
    ]);
    return page({ calls, reminders });
  },
});

export default define.page<typeof handler>(function CallsPage({ data }) {
  const { calls, reminders } = data;

  return (
    <div>
      {/* Header */}
      <div class="mb-8">
        <div
          class="t-breadcrumb mb-2"
          style="font-size:.82rem; letter-spacing:.18em;"
        >
          <span style="color: var(--green-mute);">ROOT</span>
          <span style="color: var(--b1);">/</span>
          <span style="color: var(--green-dim);">CALLS</span>
        </div>
        <h1 class="t-h1">
          VOICE_AGENT
          <span class="t-cursor" />
        </h1>
        <p
          class="mt-1"
          style="font-size:.82rem; letter-spacing:.18em; color: var(--green-mute);"
        >
          MANAGE TASKS BY VOICE
        </p>
      </div>

      {/* Web Call */}
      <section class="mb-10">
        <h2
          class="t-h2 mb-4"
          style="font-size:1.1rem;"
        >
          WEB_CALL
        </h2>
        <WebCall />
      </section>

      {/* Reminders */}
      <section class="mb-10">
        <h2
          class="t-h2 mb-4"
          style="font-size:1.1rem;"
        >
          REMINDERS
          <span
            class="ml-2 t-badge t-badge-muted"
            style="font-size:.75rem;"
          >
            {reminders.length}
          </span>
        </h2>
        {reminders.length === 0
          ? (
            <p style="font-size:.82rem; color: var(--green-faint); letter-spacing:.12em;">
              NO REMINDERS SET. USE VOICE AGENT TO CREATE ONE.
            </p>
          )
          : (
            <div class="space-y-2">
              {reminders.map((r) => <ReminderRow reminder={r} key={r.id} />)}
            </div>
          )}
      </section>

      {/* Call History */}
      <section>
        <h2
          class="t-h2 mb-4"
          style="font-size:1.1rem;"
        >
          CALL_LOG
          <span
            class="ml-2 t-badge t-badge-muted"
            style="font-size:.75rem;"
          >
            {calls.length}
          </span>
        </h2>
        {calls.length === 0
          ? (
            <p style="font-size:.82rem; color: var(--green-faint); letter-spacing:.12em;">
              NO CALLS YET.
            </p>
          )
          : (
            <div class="space-y-2">
              {calls.map((c) => <CallRow call={c} key={c.id} />)}
            </div>
          )}
      </section>
    </div>
  );
});

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const statusColor = {
    pending: "var(--cyan)",
    triggered: "var(--yellow, #ecc94b)",
    completed: "var(--green)",
    failed: "var(--red, #e53e3e)",
    cancelled: "var(--green-faint)",
  }[reminder.status] ?? "var(--green-mute)";

  return (
    <div
      class="t-card flex items-center justify-between gap-4"
      style="padding: .75rem 1rem;"
    >
      <div class="min-w-0 flex-1">
        <p
          class="truncate"
          style="font-size:.85rem; color: var(--green-dim);"
        >
          {reminder.message}
        </p>
        <p style="font-size:.72rem; color: var(--green-faint); letter-spacing:.1em; margin-top:2px;">
          {new Date(reminder.remind_at).toLocaleString()}
        </p>
      </div>
      <span
        class="t-badge shrink-0"
        style={`font-size:.7rem; color: ${statusColor}; border-color: ${statusColor};`}
      >
        {reminder.status.toUpperCase()}
      </span>
    </div>
  );
}

function CallRow({ call }: { call: CallLog }) {
  const dirIcon = call.direction === "inbound" ? "↙" : "↗";
  const typeLabel = call.call_type === "web_call" ? "WEB" : "PHONE";

  return (
    <div
      class="t-card flex items-center justify-between gap-4"
      style="padding: .75rem 1rem;"
    >
      <div class="flex items-center gap-3 min-w-0">
        <span style="color: var(--cyan); font-size:1.1rem;">{dirIcon}</span>
        <div class="min-w-0">
          <p style="font-size:.82rem; color: var(--green-dim);">
            <span class="t-badge t-badge-muted" style="font-size:.65rem; margin-right:.5rem;">
              {typeLabel}
            </span>
            {call.call_status.toUpperCase()}
            {call.duration_seconds != null && (
              <span style="color: var(--green-faint); margin-left:.5rem;">
                {Math.floor(call.duration_seconds / 60)}:{(call.duration_seconds % 60).toString().padStart(2, "0")}
              </span>
            )}
          </p>
          <p style="font-size:.72rem; color: var(--green-faint); letter-spacing:.1em; margin-top:2px;">
            {new Date(call.created_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Reminder scheduler — checks for due reminders and triggers outbound calls.
 *
 * Usage: deno task calls:scheduler
 *
 * Requires: XAI_API_KEY, XAI_AGENT_ID
 * Optional: XAI_FROM_NUMBER (when the agent has more than one number)
 */

import { placeOutboundCall } from "./xai.ts";
import { buildCallContext } from "./context.ts";
import {
  getProject,
  getTask,
  listDueReminders,
  updateReminder,
} from "../db/queries.ts";

const XAI_AGENT_ID = Deno.env.get("XAI_AGENT_ID");
const XAI_FROM_NUMBER = Deno.env.get("XAI_FROM_NUMBER");
const CHECK_INTERVAL_MS = 60_000;

if (!Deno.env.get("XAI_API_KEY") || !XAI_AGENT_ID) {
  console.error(
    "XAI_API_KEY and XAI_AGENT_ID are required for the scheduler.",
  );
  Deno.exit(1);
}

async function checkReminders() {
  try {
    const due = await listDueReminders();
    if (due.length === 0) return;

    console.log(`[scheduler] ${due.length} reminder(s) due`);

    for (const reminder of due) {
      try {
        await updateReminder(reminder.id, { status: "triggered" });

        const task = reminder.task_id ? await getTask(reminder.task_id) : undefined;
        const project =
          reminder.project_id
            ? await getProject(reminder.project_id)
            : (task ? await getProject(task.project_id) : undefined);
        const reminderContextParts = [
          `Message: ${reminder.message}`,
          `Reminder time: ${reminder.remind_at}`,
          ...(task ? [`Task: ${task.title}`] : []),
          ...(project ? [`Project: ${project.name}`] : []),
        ];
        const reminderContext = reminderContextParts.join(". ");

        const call = await placeOutboundCall({
          toNumber: reminder.phone_number,
          agentId: XAI_AGENT_ID!,
          fromNumber: XAI_FROM_NUMBER,
          variables: buildCallContext({
            mode: "reminder",
            summary: reminder.message,
            details: reminderContext,
            extra: {
              reminder_id: String(reminder.id),
              reminder_time: reminder.remind_at,
              task_id: String(reminder.task_id ?? ""),
              task_title: task?.title ?? "",
              project_name: project?.name ?? "",
            },
          }),
        });

        await updateReminder(reminder.id, {
          status: "completed",
          call_id: call.call_id,
        });

        console.log(
          `[scheduler] Reminder ${reminder.id} → call ${call.call_id}`,
        );
      } catch (err) {
        console.error(`[scheduler] Failed reminder ${reminder.id}:`, err);
        await updateReminder(reminder.id, { status: "failed" });
      }
    }
  } catch (err) {
    console.error("[scheduler] Error checking reminders:", err);
  }
}

console.log("[scheduler] Reminder scheduler started");
console.log(
  `[scheduler] Checking every ${CHECK_INTERVAL_MS / 1000}s for due reminders`,
);

// Run immediately, then on interval
checkReminders();
setInterval(checkReminders, CHECK_INTERVAL_MS);

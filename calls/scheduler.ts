/**
 * Reminder scheduler — checks for due reminders and triggers outbound calls.
 *
 * Usage: deno task calls:scheduler
 *
 * Requires: RETELL_API_KEY, RETELL_AGENT_ID, RETELL_FROM_NUMBER
 */

import { createPhoneCall } from "./retell.ts";
import { listDueReminders, updateReminder } from "../db/queries.ts";

const RETELL_AGENT_ID = Deno.env.get("RETELL_AGENT_ID");
const RETELL_FROM_NUMBER = Deno.env.get("RETELL_FROM_NUMBER");
const CHECK_INTERVAL_MS = 60_000;

if (!RETELL_AGENT_ID || !RETELL_FROM_NUMBER) {
  console.error(
    "RETELL_AGENT_ID and RETELL_FROM_NUMBER are required for the scheduler.",
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

        const call = await createPhoneCall({
          fromNumber: RETELL_FROM_NUMBER!,
          toNumber: reminder.phone_number,
          agentId: RETELL_AGENT_ID!,
          dynamicVariables: {
            reminder_message: reminder.message,
            task_id: String(reminder.task_id ?? ""),
          },
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

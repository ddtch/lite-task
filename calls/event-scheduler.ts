/**
 * Event notification scheduler — sends Telegram messages and triggers phone calls
 * for upcoming calendar events.
 *
 * - Telegram: 10 minutes before event_time → sends message to BOT_HOST_ID
 * - Phone call: 5 minutes before event_time → calls REMINDER_TO_NUMBER (only if notify_call = 1)
 *
 * Usage: deno task events:scheduler
 *
 * Requires: TELEGRAM_BOT_TOKEN, BOT_HOST_ID
 * Optional: RETELL_API_KEY, RETELL_AGENT_ID, RETELL_FROM_NUMBER, REMINDER_TO_NUMBER (for calls)
 */

import { createPhoneCall } from "./retell.ts";
import {
  listDueEventsCall,
  listDueEventsTelegram,
  listDueRecurring,
  markEventNotifiedCall,
  markEventNotifiedTelegram,
  markEventRecurringNotified,
} from "../db/queries.ts";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const BOT_HOST_ID = Deno.env.get("BOT_HOST_ID");
const RETELL_AGENT_ID = Deno.env.get("RETELL_AGENT_ID");
const RETELL_FROM_NUMBER = Deno.env.get("RETELL_FROM_NUMBER");
const REMINDER_TO_NUMBER = Deno.env.get("REMINDER_TO_NUMBER");
const CHECK_INTERVAL_MS = 60_000;

if (!TELEGRAM_BOT_TOKEN || !BOT_HOST_ID) {
  console.error("TELEGRAM_BOT_TOKEN and BOT_HOST_ID are required.");
  Deno.exit(1);
}

async function sendTelegramMessage(text: string): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: BOT_HOST_ID, text }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed (${res.status}): ${body}`);
  }
}

async function checkTelegramNotifications() {
  const due = await listDueEventsTelegram();
  if (due.length === 0) return;

  console.log(`[event-scheduler] ${due.length} Telegram notification(s) due`);

  for (const event of due) {
    try {
      const msg = `Hey, your event "${event.title}" starts in ${event.remind_before} minutes! (${event.event_date} ${event.event_time})`;
      await sendTelegramMessage(msg);
      await markEventNotifiedTelegram(event.id);
      console.log(`[event-scheduler] Telegram sent for event ${event.id}: ${event.title}`);
    } catch (err) {
      console.error(`[event-scheduler] Telegram failed for event ${event.id}:`, err);
    }
  }
}

async function checkCallNotifications() {
  if (!RETELL_AGENT_ID || !RETELL_FROM_NUMBER || !REMINDER_TO_NUMBER) return;

  const due = await listDueEventsCall();
  if (due.length === 0) return;

  console.log(`[event-scheduler] ${due.length} call notification(s) due`);

  for (const event of due) {
    try {
      const call = await createPhoneCall({
        fromNumber: RETELL_FROM_NUMBER,
        toNumber: REMINDER_TO_NUMBER,
        agentId: RETELL_AGENT_ID,
        dynamicVariables: {
          outbound_mode: "event_reminder",
          reminder_message: `Your event "${event.title}" starts in ${event.remind_before} minutes.`,
          reminder_context: `Event: ${event.title}. Date: ${event.event_date}. Time: ${event.event_time ?? "unspecified"}.`,
          event_id: String(event.id),
          event_title: event.title,
          event_date: event.event_date,
          event_time: event.event_time ?? "",
        },
      });
      await markEventNotifiedCall(event.id);
      console.log(`[event-scheduler] Call triggered for event ${event.id}: ${call.call_id}`);
    } catch (err) {
      console.error(`[event-scheduler] Call failed for event ${event.id}:`, err);
    }
  }
}

async function checkRecurringNotifications() {
  const due = await listDueRecurring();
  if (due.length === 0) return;

  const now = Date.now();

  for (const event of due) {
    const intervalMinutes = event.remind_interval === "daily" ? 1440 : 60;

    if (event.last_notified_at) {
      const lastParts = event.last_notified_at.replace("T", "-").replace(":", "-").split("-").map(Number);
      const lastDate = new Date(lastParts[0], lastParts[1] - 1, lastParts[2], lastParts[3] ?? 0, lastParts[4] ?? 0);
      const elapsedMin = (now - lastDate.getTime()) / 60_000;
      if (elapsedMin < intervalMinutes) continue;
    }

    try {
      const msg = `Recurring reminder: your event "${event.title}" is on ${event.event_date} at ${event.event_time}.`;
      await sendTelegramMessage(msg);
      console.log(`[event-scheduler] Recurring Telegram sent for event ${event.id}: ${event.title}`);

      if (event.notify_call === 1 && RETELL_AGENT_ID && RETELL_FROM_NUMBER && REMINDER_TO_NUMBER) {
        const call = await createPhoneCall({
          fromNumber: RETELL_FROM_NUMBER,
          toNumber: REMINDER_TO_NUMBER,
          agentId: RETELL_AGENT_ID,
          dynamicVariables: {
            outbound_mode: "event_reminder",
            reminder_message: `Recurring reminder: your event "${event.title}" is on ${event.event_date} at ${event.event_time}.`,
            reminder_context: `Recurring event: ${event.title}. Date: ${event.event_date}. Time: ${event.event_time ?? "unspecified"}. Interval: ${event.remind_interval ?? "none"}.`,
            event_id: String(event.id),
            event_title: event.title,
            event_date: event.event_date,
            event_time: event.event_time ?? "",
          },
        });
        console.log(`[event-scheduler] Recurring call triggered for event ${event.id}: ${call.call_id}`);
      }

      await markEventRecurringNotified(event.id);
    } catch (err) {
      console.error(`[event-scheduler] Recurring notification failed for event ${event.id}:`, err);
    }
  }
}

async function check() {
  try {
    const now = new Date();
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    console.log(`[event-scheduler] Checking at ${local} (TZ: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
    await checkTelegramNotifications();
    await checkCallNotifications();
    await checkRecurringNotifications();
  } catch (err) {
    console.error("[event-scheduler] Error:", err);
  }
}

console.log("[event-scheduler] Event notification scheduler started");
console.log(`[event-scheduler] Checking every ${CHECK_INTERVAL_MS / 1000}s`);
if (!RETELL_AGENT_ID || !RETELL_FROM_NUMBER || !REMINDER_TO_NUMBER) {
  console.log("[event-scheduler] Phone calls disabled (missing RETELL_AGENT_ID, RETELL_FROM_NUMBER, or REMINDER_TO_NUMBER)");
}

check();
setInterval(check, CHECK_INTERVAL_MS);

import { define } from "../../../utils.ts";
import { createReminder, listReminders } from "../../../db/queries.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const status = ctx.url.searchParams.get("status") ?? undefined;
    const reminders = await listReminders({ status });
    return Response.json(reminders);
  },

  async POST(ctx) {
    let body: {
      message?: string;
      remind_at?: string;
      phone_number?: string;
      task_id?: number;
      project_id?: number;
    };
    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const message = body.message?.trim();
    if (!message) {
      return Response.json({ error: "message is required" }, { status: 422 });
    }
    if (!body.remind_at) {
      return Response.json({ error: "remind_at is required" }, { status: 422 });
    }

    const phoneNumber =
      body.phone_number ?? Deno.env.get("REMINDER_TO_NUMBER") ?? "";
    if (!phoneNumber) {
      return Response.json(
        { error: "phone_number is required (or set REMINDER_TO_NUMBER)" },
        { status: 422 },
      );
    }

    const id = await createReminder({
      message,
      remind_at: body.remind_at,
      phone_number: phoneNumber,
      task_id: body.task_id ?? null,
      project_id: body.project_id ?? null,
    });

    return Response.json({ id, message, remind_at: body.remind_at }, { status: 201 });
  },
});

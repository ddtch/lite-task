import { define } from "../../../utils.ts";
import {
  deleteReminder,
  getReminder,
  updateReminder,
} from "../../../db/queries.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const id = Number(ctx.params.id);
    const reminder = await getReminder(id);
    if (!reminder) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(reminder);
  },

  async PUT(ctx) {
    const id = Number(ctx.params.id);
    const existing = await getReminder(id);
    if (!existing) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const fields: Parameters<typeof updateReminder>[1] = {};
    if (body.message !== undefined) fields.message = String(body.message).trim();
    if (body.remind_at !== undefined) fields.remind_at = String(body.remind_at);
    if (body.phone_number !== undefined) {
      fields.phone_number = String(body.phone_number);
    }
    if (body.status !== undefined) {
      const valid = ["pending", "triggered", "completed", "failed", "cancelled"];
      if (valid.includes(String(body.status))) {
        fields.status = body.status as typeof fields.status;
      }
    }

    await updateReminder(id, fields);
    const updated = await getReminder(id);
    return Response.json(updated);
  },

  async DELETE(ctx) {
    const id = Number(ctx.params.id);
    await deleteReminder(id);
    return new Response(null, { status: 204 });
  },
});

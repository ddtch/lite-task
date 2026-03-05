import { define } from "../../../utils.ts";
import { deleteEvent, getEvent, updateEvent } from "../../../db/queries.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const id = Number(ctx.params.id);
    const event = await getEvent(id);
    if (!event) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(event);
  },

  async PUT(ctx) {
    const id = Number(ctx.params.id);
    const existing = await getEvent(id);
    if (!existing) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const fields: Parameters<typeof updateEvent>[1] = {};
    if (body.title !== undefined) fields.title = String(body.title).trim();
    if (body.description !== undefined) fields.description = String(body.description).trim();
    if (body.event_date !== undefined) fields.event_date = String(body.event_date);
    if (body.event_time !== undefined) fields.event_time = body.event_time ? String(body.event_time) : null;
    if (body.type !== undefined) {
      const valid = ["event", "note", "reminder"];
      if (valid.includes(String(body.type))) {
        fields.type = body.type as "event" | "note" | "reminder";
      }
    }
    if (body.project_id !== undefined) {
      fields.project_id = body.project_id ? Number(body.project_id) : null;
    }
    if (body.notify_call !== undefined) {
      fields.notify_call = body.notify_call ? 1 : 0;
    }
    if (body.remind_before !== undefined) {
      fields.remind_before = Number(body.remind_before);
    }
    if (body.remind_interval !== undefined) {
      const validIntervals = ["hourly", "daily"];
      fields.remind_interval = validIntervals.includes(String(body.remind_interval))
        ? String(body.remind_interval)
        : null;
    }

    // Reset notification state so notifications re-fire with new timing
    fields.notified_telegram = 0;
    fields.notified_call = 0;
    fields.last_notified_at = null;

    await updateEvent(id, fields);
    const updated = await getEvent(id);
    return Response.json(updated);
  },

  async DELETE(ctx) {
    const id = Number(ctx.params.id);
    await deleteEvent(id);
    return new Response(null, { status: 204 });
  },
});

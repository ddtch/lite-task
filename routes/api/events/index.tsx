import { define } from "../../../utils.ts";
import { createEvent, listEvents } from "../../../db/queries.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const month = ctx.url.searchParams.get("month") ?? undefined;
    const projectId = ctx.url.searchParams.get("project_id");
    const events = await listEvents({
      month,
      projectId: projectId ? Number(projectId) : undefined,
    });
    return Response.json(events);
  },

  async POST(ctx) {
    let body: {
      title?: string;
      description?: string;
      event_date?: string;
      event_time?: string | null;
      type?: string;
      project_id?: number | null;
      notify_call?: boolean;
    };
    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const title = body.title?.trim();
    if (!title) {
      return Response.json({ error: "title is required" }, { status: 422 });
    }
    if (!body.event_date) {
      return Response.json({ error: "event_date is required" }, { status: 422 });
    }

    const validTypes = ["event", "note", "reminder"];
    const type = validTypes.includes(body.type ?? "")
      ? (body.type as "event" | "note" | "reminder")
      : "event";

    const id = await createEvent({
      title,
      description: body.description?.trim(),
      event_date: body.event_date,
      event_time: body.event_time ?? null,
      type,
      project_id: body.project_id ?? null,
      notify_call: body.notify_call ?? false,
    });

    return Response.json({ id, title, event_date: body.event_date, type }, { status: 201 });
  },
});

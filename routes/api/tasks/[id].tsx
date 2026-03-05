import { define } from "../../../utils.ts";
import {
  deleteTask,
  getTask,
  listAttachments,
  updateTask,
} from "../../../db/queries.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const id = Number(ctx.params.id);
    const task = await getTask(id);
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });
    const attachments = await listAttachments(id);
    return Response.json({ ...task, attachments });
  },

  async PUT(ctx) {
    const id = Number(ctx.params.id);
    const task = await getTask(id);
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });

    let body: {
      title?: string;
      description?: string;
      priority?: string;
      status?: string;
      due_date?: string | null;
    };
    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const validPriorities = ["low", "medium", "high"];
    const validStatuses = ["todo", "in_progress", "done"];

    await updateTask(id, {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description.trim() } : {}),
      ...(body.priority && validPriorities.includes(body.priority)
        ? { priority: body.priority as "low" | "medium" | "high" }
        : {}),
      ...(body.status && validStatuses.includes(body.status)
        ? { status: body.status as "todo" | "in_progress" | "done" }
        : {}),
      ...(body.due_date !== undefined ? { due_date: body.due_date || null } : {}),
    });

    return Response.json({ ...await getTask(id) });
  },

  async DELETE(ctx) {
    const id = Number(ctx.params.id);
    const task = await getTask(id);
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });
    await deleteTask(id);
    return Response.json({ deleted: true });
  },
});

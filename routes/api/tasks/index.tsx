import { define } from "../../../utils.ts";
import { createTask, listAllTasks } from "../../../db/queries.ts";

export const handler = define.handlers({
  GET(ctx) {
    const url = ctx.url;
    const projectId = url.searchParams.get("project_id");
    const status = url.searchParams.get("status") ?? undefined;
    const priority = url.searchParams.get("priority") ?? undefined;

    const tasks = listAllTasks({
      projectId: projectId ? Number(projectId) : undefined,
      status,
      priority,
    });
    return Response.json(tasks);
  },

  async POST(ctx) {
    let body: {
      project_id?: number;
      title?: string;
      description?: string;
      priority?: string;
      status?: string;
    };
    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.project_id) {
      return Response.json({ error: "project_id is required" }, { status: 422 });
    }
    const title = body.title?.trim();
    if (!title) {
      return Response.json({ error: "title is required" }, { status: 422 });
    }

    const validPriorities = ["low", "medium", "high"];
    const validStatuses = ["todo", "in_progress", "done"];
    const priority = validPriorities.includes(body.priority ?? "")
      ? (body.priority as "low" | "medium" | "high")
      : "medium";
    const status = validStatuses.includes(body.status ?? "")
      ? (body.status as "todo" | "in_progress" | "done")
      : "todo";

    const id = createTask(
      body.project_id,
      title,
      body.description?.trim() ?? "",
      priority,
      status,
    );
    return Response.json({ id, title, priority, status }, { status: 201 });
  },
});

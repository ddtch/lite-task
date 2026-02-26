import { define } from "../../../utils.ts";
import {
  deleteProject,
  getProject,
  listTasks,
  updateProject,
} from "../../../db/queries.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const id = Number(ctx.params.id);
    const project = await getProject(id);
    if (!project) return Response.json({ error: "Not found" }, { status: 404 });
    const tasks = await listTasks(id);
    return Response.json({ ...project, tasks });
  },

  async PUT(ctx) {
    const id = Number(ctx.params.id);
    const project = await getProject(id);
    if (!project) return Response.json({ error: "Not found" }, { status: 404 });

    let body: { name?: string; description?: string };
    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const name = body.name?.trim() ?? project.name;
    const description = body.description?.trim() ?? project.description;
    await updateProject(id, name, description);
    return Response.json({ id, name, description });
  },

  async DELETE(ctx) {
    const id = Number(ctx.params.id);
    const project = await getProject(id);
    if (!project) return Response.json({ error: "Not found" }, { status: 404 });
    await deleteProject(id);
    return Response.json({ deleted: true });
  },
});

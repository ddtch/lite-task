import { define } from "../../../utils.ts";
import { createProject, listProjects } from "../../../db/queries.ts";

export const handler = define.handlers({
  GET() {
    const projects = listProjects();
    return Response.json(projects);
  },

  async POST(ctx) {
    let body: { name?: string; description?: string };
    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const name = body.name?.trim();
    if (!name) {
      return Response.json({ error: "name is required" }, { status: 422 });
    }
    const description = body.description?.trim() ?? "";
    const id = createProject(name, description);
    return Response.json({ id, name, description }, { status: 201 });
  },
});

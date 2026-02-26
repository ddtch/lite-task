import { page } from "fresh";
import { define } from "../../../../../utils.ts";
import {
  getProject,
  getTask,
  updateTask,
} from "../../../../../db/queries.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const projectId = Number(ctx.params.id);
    const taskId = Number(ctx.params.taskId);
    const [project, task] = await Promise.all([getProject(projectId), getTask(taskId)]);
    if (!project || !task || task.project_id !== projectId) {
      return new Response("Not found", { status: 404 });
    }
    return page({ project, task, error: null });
  },

  async POST(ctx) {
    const projectId = Number(ctx.params.id);
    const taskId = Number(ctx.params.taskId);
    const [project, task] = await Promise.all([getProject(projectId), getTask(taskId)]);
    if (!project || !task || task.project_id !== projectId) {
      return new Response("Not found", { status: 404 });
    }

    const form = await ctx.req.formData();
    const title = (form.get("title") as string | null)?.trim() ?? "";
    const description = (form.get("description") as string | null)?.trim() ?? "";
    const priority = form.get("priority") as string;
    const status = form.get("status") as string;

    if (!title) {
      return page({ project, task, error: "Title is required" }, { status: 422 });
    }

    await updateTask(taskId, {
      title,
      description,
      priority: priority as "low" | "medium" | "high",
      status: status as "todo" | "in_progress" | "done",
    });

    return new Response(null, {
      status: 303,
      headers: { Location: `/projects/${projectId}/tasks/${taskId}` },
    });
  },
});

export default define.page<typeof handler>(function EditTaskPage({ data }) {
  const { project, task, error } = data;

  return (
    <div style="max-width: 36rem;">
      {/* Breadcrumb */}
      <div class="t-breadcrumb mb-5" style="font-size:.82rem; letter-spacing:.14em;">
        <a href="/projects">ROOT/PROJECTS</a>
        <span style="color: var(--b1);">/</span>
        <a href={`/projects/${project.id}`}>{project.name.toUpperCase()}</a>
        <span style="color: var(--b1);">/</span>
        <a href={`/projects/${project.id}/tasks/${task.id}`} style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">
          {task.title.toUpperCase()}
        </a>
        <span style="color: var(--b1);">/</span>
        <span style="color: var(--green-dim);">EDIT</span>
      </div>

      <h1 class="t-h1 mb-7">
        EDIT_TASK
        <span class="t-cursor" />
      </h1>

      {error && (
        <div class="t-error mb-5">ERR: {error}</div>
      )}

      <form method="POST" class="flex flex-col gap-5">
        <div>
          <label class="t-field-label">TITLE <span style="color:var(--red);">*</span></label>
          <input
            type="text"
            name="title"
            required
            value={task.title}
            class="t-input"
          />
        </div>

        <div>
          <label class="t-field-label">DESCRIPTION</label>
          <textarea
            name="description"
            rows={4}
            class="t-input"
          >
            {task.description}
          </textarea>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="t-field-label">PRIORITY</label>
            <select name="priority" class="t-input t-select">
              <option value="low" selected={task.priority === "low"}>LOW</option>
              <option value="medium" selected={task.priority === "medium"}>MEDIUM</option>
              <option value="high" selected={task.priority === "high"}>HIGH</option>
            </select>
          </div>

          <div>
            <label class="t-field-label">STATUS</label>
            <select name="status" class="t-input t-select">
              <option value="todo" selected={task.status === "todo"}>TODO</option>
              <option value="in_progress" selected={task.status === "in_progress"}>ACTIVE</option>
              <option value="done" selected={task.status === "done"}>DONE</option>
            </select>
          </div>
        </div>

        <div
          style="border-top: 1px solid var(--b0); padding-top: 1rem; display:flex; gap: 10px;"
        >
          <button type="submit" class="t-btn t-btn-primary">SAVE</button>
          <a href={`/projects/${project.id}/tasks/${task.id}`} class="t-btn">ABORT</a>
        </div>
      </form>
    </div>
  );
});

import { page } from "fresh";
import { define } from "../../../../utils.ts";
import { createTask, getProject } from "../../../../db/queries.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const projectId = Number(ctx.params.id);
    const project = await getProject(projectId);
    if (!project) {
      return new Response("Project not found", { status: 404 });
    }
    return page({ project, error: null });
  },

  async POST(ctx) {
    const projectId = Number(ctx.params.id);
    const project = await getProject(projectId);
    if (!project) {
      return new Response("Project not found", { status: 404 });
    }

    const form = await ctx.req.formData();
    const title = (form.get("title") as string | null)?.trim() ?? "";
    const description = (form.get("description") as string | null)?.trim() ?? "";
    const priority = (form.get("priority") as string | null) ?? "medium";
    const status = (form.get("status") as string | null) ?? "todo";

    if (!title) {
      return page({ project, error: "Title is required" }, { status: 422 });
    }

    const taskId = await createTask(
      projectId,
      title,
      description,
      priority as "low" | "medium" | "high",
      status as "todo" | "in_progress" | "done",
    );

    return new Response(null, {
      status: 303,
      headers: { Location: `/projects/${projectId}/tasks/${taskId}` },
    });
  },
});

export default define.page<typeof handler>(function NewTaskPage({ data }) {
  const { project, error } = data;

  return (
    <div style="max-width: 36rem;">
      {/* Breadcrumb */}
      <div class="t-breadcrumb mb-5" style="font-size:.82rem; letter-spacing:.15em;">
        <a href="/projects">ROOT/PROJECTS</a>
        <span style="color: var(--b1);">/</span>
        <a href={`/projects/${project.id}`}>{project.name.toUpperCase()}</a>
        <span style="color: var(--b1);">/</span>
        <span style="color: var(--green-dim);">NEW_TASK</span>
      </div>

      <h1 class="t-h1 mb-7">
        CREATE_TASK
        <span class="t-cursor" />
      </h1>

      {error && (
        <div class="t-error mb-5">
          ERR: {error}
        </div>
      )}

      <form method="POST" class="flex flex-col gap-5">
        <div>
          <label class="t-field-label">TITLE <span style="color:var(--red);">*</span></label>
          <input
            type="text"
            name="title"
            required
            autofocus
            placeholder="task_title_here..."
            class="t-input"
          />
        </div>

        <div>
          <label class="t-field-label">DESCRIPTION</label>
          <textarea
            name="description"
            rows={4}
            placeholder="// describe the task (optional)..."
            class="t-input"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="t-field-label">PRIORITY</label>
            <select name="priority" class="t-input t-select">
              <option value="low">LOW</option>
              <option value="medium" selected>MEDIUM</option>
              <option value="high">HIGH</option>
            </select>
          </div>

          <div>
            <label class="t-field-label">STATUS</label>
            <select name="status" class="t-input t-select">
              <option value="todo" selected>TODO</option>
              <option value="in_progress">ACTIVE</option>
              <option value="done">DONE</option>
            </select>
          </div>
        </div>

        <div
          class="pt-1"
          style="border-top: 1px solid var(--b0); padding-top: 1rem; display:flex; gap: 10px;"
        >
          <button type="submit" class="t-btn t-btn-primary">
            EXECUTE
          </button>
          <a href={`/projects/${project.id}`} class="t-btn">
            ABORT
          </a>
        </div>
      </form>
    </div>
  );
});

const FormField = (
  { label, required, children }: {
    label: string;
    required?: boolean;
    children: unknown;
  },
) => (
  <div>
    <label class="t-field-label">
      {label}
      {required && <span style="color:var(--red); margin-left:4px;">*</span>}
    </label>
    {children}
  </div>
);

import { page } from "fresh";
import { define } from "../../../../utils.ts";
import { createTask, getProject } from "../../../../db/queries.ts";

export const handler = define.handlers({
  async GET(ctx) {
    const projectId = Number(ctx.params.id);
    const project = getProject(projectId);
    if (!project) {
      return new Response("Project not found", { status: 404 });
    }
    return page({ project, error: null });
  },

  async POST(ctx) {
    const projectId = Number(ctx.params.id);
    const project = getProject(projectId);
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

    const taskId = createTask(
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
    <div class="max-w-2xl">
      <div class="flex items-center gap-2 text-sm text-zinc-500 mb-6">
        <a href="/projects" class="hover:text-zinc-300 transition-colors">
          Projects
        </a>
        <span>/</span>
        <a
          href={`/projects/${project.id}`}
          class="hover:text-zinc-300 transition-colors"
        >
          {project.name}
        </a>
        <span>/</span>
        <span class="text-zinc-300">New Task</span>
      </div>

      <h1 class="text-2xl font-bold text-white mb-8">New Task</h1>

      {error && (
        <div class="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <form method="POST" class="space-y-6">
        <FormField label="Title" required>
          <input
            type="text"
            name="title"
            required
            autofocus
            placeholder="Task title..."
            class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
          />
        </FormField>

        <FormField label="Description">
          <textarea
            name="description"
            rows={4}
            placeholder="Describe the task (optional)..."
            class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors resize-none"
          />
        </FormField>

        <div class="grid grid-cols-2 gap-4">
          <FormField label="Priority">
            <select
              name="priority"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            >
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>
          </FormField>

          <FormField label="Status">
            <select
              name="status"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            >
              <option value="todo" selected>To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </FormField>
        </div>

        <div class="flex items-center gap-3 pt-2">
          <button
            type="submit"
            class="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg transition-colors"
          >
            Create Task
          </button>
          <a
            href={`/projects/${project.id}`}
            class="px-6 py-2.5 text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors text-sm"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
});

function FormField(
  { label, required, children }: {
    label: string;
    required?: boolean;
    children: unknown;
  },
) {
  return (
    <div>
      <label class="block text-sm font-medium text-zinc-300 mb-1.5">
        {label}
        {required && <span class="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

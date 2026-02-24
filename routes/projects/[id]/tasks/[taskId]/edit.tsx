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
    const [project, task] = [getProject(projectId), getTask(taskId)];
    if (!project || !task || task.project_id !== projectId) {
      return new Response("Not found", { status: 404 });
    }
    return page({ project, task, error: null });
  },

  async POST(ctx) {
    const projectId = Number(ctx.params.id);
    const taskId = Number(ctx.params.taskId);
    const [project, task] = [getProject(projectId), getTask(taskId)];
    if (!project || !task || task.project_id !== projectId) {
      return new Response("Not found", { status: 404 });
    }

    const form = await ctx.req.formData();
    const title = (form.get("title") as string | null)?.trim() ?? "";
    const description = (form.get("description") as string | null)?.trim() ?? "";
    const priority = form.get("priority") as string;
    const status = form.get("status") as string;

    if (!title) {
      return page({ project, task, error: "Title is required" }, {
        status: 422,
      });
    }

    updateTask(taskId, {
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
        <a
          href={`/projects/${project.id}/tasks/${task.id}`}
          class="hover:text-zinc-300 transition-colors truncate"
        >
          {task.title}
        </a>
        <span>/</span>
        <span class="text-zinc-300">Edit</span>
      </div>

      <h1 class="text-2xl font-bold text-white mb-8">Edit Task</h1>

      {error && (
        <div class="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <form method="POST" class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-zinc-300 mb-1.5">
            Title <span class="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="title"
            required
            value={task.title}
            class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-zinc-300 mb-1.5">
            Description
          </label>
          <textarea
            name="description"
            rows={4}
            class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors resize-none"
          >
            {task.description}
          </textarea>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-zinc-300 mb-1.5">
              Priority
            </label>
            <select
              name="priority"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            >
              <option value="low" selected={task.priority === "low"}>Low</option>
              <option value="medium" selected={task.priority === "medium"}>Medium</option>
              <option value="high" selected={task.priority === "high"}>High</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-zinc-300 mb-1.5">
              Status
            </label>
            <select
              name="status"
              class="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            >
              <option value="todo" selected={task.status === "todo"}>To Do</option>
              <option value="in_progress" selected={task.status === "in_progress"}>
                In Progress
              </option>
              <option value="done" selected={task.status === "done"}>Done</option>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-3 pt-2">
          <button
            type="submit"
            class="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg transition-colors"
          >
            Save Changes
          </button>
          <a
            href={`/projects/${project.id}/tasks/${task.id}`}
            class="px-6 py-2.5 text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors text-sm"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
});

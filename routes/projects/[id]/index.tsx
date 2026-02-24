import { page } from "fresh";
import { define } from "../../../utils.ts";
import { deleteProject, getProject, listTasks, type Task } from "../../../db/queries.ts";
import { PriorityBadge, StatusBadge } from "../../../components/Badge.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const id = Number(ctx.params.id);
    const project = getProject(id);
    if (!project) {
      return new Response("Project not found", { status: 404 });
    }
    const tasks = listTasks(id);
    return page({ project, tasks });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const action = form.get("_action") as string | null;
    const id = Number(ctx.params.id);

    if (action === "delete") {
      deleteProject(id);
      return new Response(null, {
        status: 303,
        headers: { Location: "/projects" },
      });
    }

    return new Response("Bad request", { status: 400 });
  },
});

export default define.page<typeof handler>(function ProjectPage({ data }) {
  const { project, tasks } = data;

  const todo = tasks.filter((t) => t.status === "todo");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div>
      {/* Header */}
      <div class="flex items-start justify-between mb-8 gap-4">
        <div>
          <div class="flex items-center gap-2 text-sm text-zinc-500 mb-2">
            <a href="/projects" class="hover:text-zinc-300 transition-colors">
              Projects
            </a>
            <span>/</span>
            <span class="text-zinc-300">{project.name}</span>
          </div>
          <h1 class="text-2xl font-bold text-white">{project.name}</h1>
          {project.description && (
            <p class="text-zinc-400 mt-1 text-sm">{project.description}</p>
          )}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a
            href={`/projects/${project.id}/tasks/new`}
            class="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <span class="text-base leading-none">+</span> New Task
          </a>
          <form method="POST">
            <input type="hidden" name="_action" value="delete" />
            <button
              type="submit"
              class="px-3 py-2 text-sm text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-500/50 rounded-lg transition-colors"
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      {/* Stats */}
      <div class="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="To Do" count={todo.length} color="zinc" />
        <StatCard label="In Progress" count={inProgress.length} color="blue" />
        <StatCard label="Done" count={done.length} color="emerald" />
      </div>

      {/* Task list */}
      {tasks.length === 0
        ? (
          <div class="text-center py-20 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
            <p class="text-lg font-medium text-zinc-400">No tasks yet</p>
            <p class="text-sm mt-1">
              <a
                href={`/projects/${project.id}/tasks/new`}
                class="text-violet-400 hover:underline"
              >
                Create your first task
              </a>
            </p>
          </div>
        )
        : (
          <div class="space-y-2">
            {tasks.map((task) => (
              <TaskRow
                task={task}
                projectId={project.id}
                key={task.id}
              />
            ))}
          </div>
        )}
    </div>
  );
});

function StatCard(
  { label, count, color }: {
    label: string;
    count: number;
    color: "zinc" | "blue" | "emerald";
  },
) {
  const colors = {
    zinc: "text-zinc-400",
    blue: "text-blue-400",
    emerald: "text-emerald-400",
  };
  return (
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
      <div class={`text-2xl font-bold ${colors[color]}`}>{count}</div>
      <div class="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

function TaskRow(
  { task, projectId }: { task: Task; projectId: number },
) {
  return (
    <a
      href={`/projects/${projectId}/tasks/${task.id}`}
      class="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all group"
    >
      <div class="flex-1 min-w-0">
        <span class="font-medium text-zinc-200 group-hover:text-white transition-colors truncate block">
          {task.title}
        </span>
        {task.description && (
          <span class="text-sm text-zinc-500 truncate block mt-0.5">
            {task.description}
          </span>
        )}
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <PriorityBadge priority={task.priority} />
        <StatusBadge status={task.status} />
      </div>
    </a>
  );
}

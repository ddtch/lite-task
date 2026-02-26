import { page } from "fresh";
import { define } from "../../../utils.ts";
import { deleteProject, getProject, listTasks, type Task } from "../../../db/queries.ts";
import { PriorityBadge, StatusBadge } from "../../../components/Badge.tsx";
import KanbanBoard from "../../../islands/KanbanBoard.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const id = Number(ctx.params.id);
    const project = getProject(id);
    if (!project) {
      return new Response("Project not found", { status: 404 });
    }
    const tasks = listTasks(id);
    const view = ctx.url.searchParams.get("view") === "board" ? "board" : "list";
    return page({ project, tasks, view });
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
  const { project, tasks, view } = data;

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

      {/* Stats + view toggle */}
      <div class="flex items-center gap-4 mb-8">
        <div class="grid grid-cols-3 gap-4 flex-1">
          <StatCard label="To Do" count={todo.length} color="zinc" />
          <StatCard label="In Progress" count={inProgress.length} color="blue" />
          <StatCard label="Done" count={done.length} color="emerald" />
        </div>

        {/* View toggle */}
        <div class="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 shrink-0">
          <a
            href={`/projects/${project.id}?view=list`}
            class={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === "list"
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            List
          </a>
          <a
            href={`/projects/${project.id}?view=board`}
            class={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              view === "board"
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Board
          </a>
        </div>
      </div>

      {/* Empty state */}
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
        : view === "board"
        ? (
          /* ── Board view ── */
          <KanbanBoard tasks={tasks} projectId={project.id} />
        )
        : (
          /* ── List view ── */
          <div class="space-y-6">
            <TaskGroup
              label="In Progress"
              tasks={inProgress}
              projectId={project.id}
              accent="text-blue-400"
            />
            <TaskGroup
              label="To Do"
              tasks={todo}
              projectId={project.id}
              accent="text-zinc-400"
            />
            <TaskGroup
              label="Done"
              tasks={done}
              projectId={project.id}
              accent="text-emerald-400"
            />
          </div>
        )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard(
  { label, count, color }: {
    label: string;
    count: number;
    color: "zinc" | "blue" | "emerald";
  },
) {
  const colors = { zinc: "text-zinc-400", blue: "text-blue-400", emerald: "text-emerald-400" };
  return (
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
      <div class={`text-2xl font-bold ${colors[color]}`}>{count}</div>
      <div class="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view — grouped section
// ---------------------------------------------------------------------------

function TaskGroup(
  { label, tasks, projectId, accent }: {
    label: string;
    tasks: Task[];
    projectId: number;
    accent: string;
  },
) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div class="flex items-center gap-2 mb-3">
        <span class={`text-xs font-semibold uppercase tracking-wider ${accent}`}>{label}</span>
        <span class="text-xs text-zinc-600 font-mono">{tasks.length}</span>
      </div>
      <div class="space-y-2">
        {tasks.map((task) => <TaskRow task={task} projectId={projectId} key={task.id} />)}
      </div>
    </div>
  );
}

function TaskRow({ task, projectId }: { task: Task; projectId: number }) {
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


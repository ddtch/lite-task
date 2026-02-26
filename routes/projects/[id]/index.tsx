import { page } from "fresh";
import { define } from "../../../utils.ts";
import { deleteProject, getProject, listTasks, type Task } from "../../../db/queries.ts";
import { PriorityBadge, StatusBadge } from "../../../components/Badge.tsx";
import KanbanBoard from "../../../islands/KanbanBoard.tsx";
import ViewToggle from "../../../islands/ViewToggle.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const id = Number(ctx.params.id);
    const project = await getProject(id);
    if (!project) {
      return new Response("Project not found", { status: 404 });
    }
    const tasks = await listTasks(id);
    const viewParam = ctx.url.searchParams.get("view");
    const view = viewParam === "list" ? "list" : "board";
    const hasViewParam = viewParam === "list" || viewParam === "board";
    return page({ project, tasks, view, hasViewParam });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const action = form.get("_action") as string | null;
    const id = Number(ctx.params.id);

    if (action === "delete") {
      await deleteProject(id);
      return new Response(null, {
        status: 303,
        headers: { Location: "/projects" },
      });
    }

    return new Response("Bad request", { status: 400 });
  },
});

export default define.page<typeof handler>(function ProjectPage({ data }) {
  const { project, tasks, view, hasViewParam } = data;

  const todo = tasks.filter((t) => t.status === "todo");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div>
      {/* Breadcrumb */}
      <div class="t-breadcrumb mb-5" style="font-size:.82rem; letter-spacing:.16em;">
        <a href="/projects">ROOT/PROJECTS</a>
        <span style="color: var(--b1);">/</span>
        <span style="color: var(--green-dim);">{project.name.toUpperCase()}</span>
      </div>

      {/* Header */}
      <div class="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 class="t-h1">{project.name}</h1>
          {project.description && (
            <p class="mt-1" style="font-size:.85rem; color: var(--green-mute); line-height:1.5;">
              {project.description}
            </p>
          )}
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a
            href={`/projects/${project.id}/tasks/new`}
            class="t-btn t-btn-primary"
          >
            <span>+</span> NEW_TASK
          </a>
          <form method="POST">
            <input type="hidden" name="_action" value="delete" />
            <button type="submit" class="t-btn t-btn-danger">
              DEL
            </button>
          </form>
        </div>
      </div>

      {/* Stats + view toggle */}
      <div class="flex items-center gap-4 mb-8">
        <div class="grid grid-cols-3 gap-3 flex-1">
          <StatCard label="TODO" count={todo.length} color="muted" />
          <StatCard label="ACTIVE" count={inProgress.length} color="cyan" />
          <StatCard label="DONE" count={done.length} color="green" />
        </div>

        <ViewToggle
          projectId={project.id}
          currentView={view}
          hasViewParam={hasViewParam}
        />
      </div>

      {/* Empty state */}
      {tasks.length === 0
        ? (
          <div class="t-empty">
            <div class="t-empty-icon">◈</div>
            <p class="t-h2" style="color: var(--green-mute);">NO TASKS</p>
            <p class="mt-2" style="font-size:.82rem; letter-spacing:.15em; color: var(--green-faint);">
              <a
                href={`/projects/${project.id}/tasks/new`}
                style="color: var(--green-dim);"
              >
                &gt; CREATE_FIRST_TASK
              </a>
            </p>
          </div>
        )
        : view === "board"
        ? (
          <KanbanBoard tasks={tasks} projectId={project.id} />
        )
        : (
          <div class="flex flex-col gap-6">
            <TaskGroup
              label="ACTIVE"
              tasks={inProgress}
              projectId={project.id}
              accentColor="var(--cyan)"
            />
            <TaskGroup
              label="TODO"
              tasks={todo}
              projectId={project.id}
              accentColor="var(--green-mute)"
            />
            <TaskGroup
              label="DONE"
              tasks={done}
              projectId={project.id}
              accentColor="var(--green)"
            />
          </div>
        )}
    </div>
  );
});

// ── Stat card ──

const StatCard = (
  { label, count, color }: {
    label: string;
    count: number;
    color: "muted" | "cyan" | "green";
  },
) => {
  const numColors = {
    muted: "var(--green-dim)",
    cyan: "var(--cyan)",
    green: "var(--green)",
  };
  return (
    <div class="t-stat">
      <div class="t-stat-num" style={`color: ${numColors[color]};`}>{count}</div>
      <div class="t-stat-label">{label}</div>
    </div>
  );
};

// ── Task group ──

const TaskGroup = (
  { label, tasks, projectId, accentColor }: {
    label: string;
    tasks: Task[];
    projectId: number;
    accentColor: string;
  },
) => {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div class="t-group-hd" style={`color: ${accentColor};`}>
        <span>{label}</span>
        <span style="color: var(--green-faint); font-size:.8rem;">[{tasks.length}]</span>
        <div class="flex-1 h-px ml-2" style="background: var(--b0);" />
      </div>
      <div class="flex flex-col gap-1.5">
        {tasks.map((task) => <TaskRow task={task} projectId={projectId} key={task.id} />)}
      </div>
    </div>
  );
};

const TaskRow = ({ task, projectId }: { task: Task; projectId: number }) => (
  <a href={`/projects/${projectId}/tasks/${task.id}`} class="t-row">
    <div class="flex-1 min-w-0">
      <span class="block truncate" style="color: var(--green-dim); font-size:.9rem;">
        {task.title}
      </span>
      {task.description && (
        <span class="block truncate mt-0.5" style="font-size:.78rem; color: var(--green-faint);">
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

import { useRef, useState } from "preact/hooks";
import { PriorityBadge } from "../components/Badge.tsx";
import type { Priority, Status } from "../components/Badge.tsx";

interface Task {
  id: number;
  title: string;
  description?: string | null;
  status: Status;
  priority: Priority;
}

interface Props {
  tasks: Task[];
  projectId: number;
}

const COLUMNS: {
  status: Status;
  label: string;
  accent: string;
  emptyBorder: string;
  overBg: string;
}[] = [
  {
    status: "todo",
    label: "To Do",
    accent: "text-zinc-400",
    emptyBorder: "border-zinc-800",
    overBg: "bg-zinc-800/30",
  },
  {
    status: "in_progress",
    label: "In Progress",
    accent: "text-blue-400",
    emptyBorder: "border-blue-900/40",
    overBg: "bg-blue-950/30",
  },
  {
    status: "done",
    label: "Done",
    accent: "text-emerald-400",
    emptyBorder: "border-emerald-900/40",
    overBg: "bg-emerald-950/20",
  },
];

export default function KanbanBoard({ tasks: initial, projectId }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overColumn, setOverColumn] = useState<Status | null>(null);
  // Track confirmed server state for rollback
  const confirmed = useRef<Task[]>(initial);

  async function move(taskId: number, status: Status) {
    // Skip no-op drops
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;

    // Optimistic update
    const next = tasks.map((t) => t.id === taskId ? { ...t, status } : t);
    setTasks(next);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      confirmed.current = next;
    } catch {
      // Revert to last confirmed state on failure
      setTasks(confirmed.current);
    }
  }

  return (
    <div class="grid grid-cols-3 gap-5 items-start">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        const isOver = overColumn === col.status;

        return (
          <div
            key={col.status}
            class={`flex flex-col gap-3 rounded-xl p-2 -m-2 transition-colors duration-150 ${
              isOver ? col.overBg : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer!.dropEffect = "move";
              setOverColumn(col.status);
            }}
            onDragLeave={(e) => {
              // Only clear when truly leaving the column, not entering a child
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                setOverColumn(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOverColumn(null);
              const id = Number(e.dataTransfer!.getData("text/plain"));
              if (id) move(id, col.status);
            }}
          >
            {/* Column header */}
            <div class="flex items-center gap-2 px-1">
              <span class={`text-xs font-semibold uppercase tracking-wider ${col.accent}`}>
                {col.label}
              </span>
              <span class="text-xs text-zinc-600 font-mono">{colTasks.length}</span>
            </div>

            {/* Cards or empty state */}
            {colTasks.length === 0
              ? (
                <div
                  class={`border border-dashed ${col.emptyBorder} rounded-xl py-10 text-center text-xs transition-all duration-150 ${
                    isOver ? "border-solid text-zinc-500" : "text-zinc-700"
                  }`}
                >
                  {isOver ? "Drop here" : "Empty"}
                </div>
              )
              : (
                <div class="flex flex-col gap-2">
                  {colTasks.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      projectId={projectId}
                      isDragging={draggingId === task.id}
                      onDragStart={() => setDraggingId(task.id)}
                      onDragEnd={() => { setDraggingId(null); setOverColumn(null); }}
                    />
                  ))}
                </div>
              )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function KanbanCard(
  { task, projectId, isDragging, onDragStart, onDragEnd }: {
    task: Task;
    projectId: number;
    isDragging: boolean;
    onDragStart: () => void;
    onDragEnd: () => void;
  },
) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer!.setData("text/plain", String(task.id));
        e.dataTransfer!.effectAllowed = "move";
      }}
      onDragEnd={onDragEnd}
      class={`transition-all duration-150 ${
        isDragging ? "opacity-40 scale-[0.97]" : ""
      }`}
    >
      {/* Inner <a> handles navigation; draggable=false prevents browser's default link-drag */}
      <a
        href={`/projects/${projectId}/tasks/${task.id}`}
        draggable={false}
        class="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all group cursor-grab active:cursor-grabbing"
      >
        <p class="text-sm font-medium text-zinc-200 group-hover:text-white leading-snug mb-3">
          {task.title}
        </p>
        {task.description && (
          <p class="text-xs text-zinc-500 line-clamp-2 mb-3">{task.description}</p>
        )}
        <PriorityBadge priority={task.priority} />
      </a>
    </div>
  );
}

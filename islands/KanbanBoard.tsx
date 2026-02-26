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
  accentColor: string;
}[] = [
  { status: "todo",        label: "TODO",   accentColor: "var(--green-mute)" },
  { status: "in_progress", label: "ACTIVE", accentColor: "var(--cyan)"       },
  { status: "done",        label: "DONE",   accentColor: "var(--green)"      },
];

export default function KanbanBoard({ tasks: initial, projectId }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overColumn, setOverColumn] = useState<Status | null>(null);
  const confirmed = useRef<Task[]>(initial);

  async function move(taskId: number, status: Status) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;

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
            class="t-kan-col"
            style={isOver ? "background: rgba(0,255,65,.03); transition: background 150ms;" : ""}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer!.dropEffect = "move";
              setOverColumn(col.status);
            }}
            onDragLeave={(e) => {
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
            <div class="t-kan-col-hd" style={`color: ${col.accentColor};`}>
              <span>{col.label}</span>
              <span style="font-size:.8rem; color: var(--green-faint);">[{colTasks.length}]</span>
            </div>

            {colTasks.length === 0
              ? (
                <div class={`t-kan-empty ${isOver ? "over" : ""}`}>
                  {isOver ? "DROP_HERE" : "EMPTY"}
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

const KanbanCard = (
  { task, projectId, isDragging, onDragStart, onDragEnd }: {
    task: Task;
    projectId: number;
    isDragging: boolean;
    onDragStart: () => void;
    onDragEnd: () => void;
  },
) => (
  <div
    draggable
    onDragStart={(e) => {
      onDragStart();
      e.dataTransfer!.setData("text/plain", String(task.id));
      e.dataTransfer!.effectAllowed = "move";
    }}
    onDragEnd={onDragEnd}
    class={`t-kan-card ${isDragging ? "dragging" : ""}`}
  >
    <a
      href={`/projects/${projectId}/tasks/${task.id}`}
      draggable={false}
      style="display:block; text-decoration:none;"
    >
      <p class="mb-2" style="font-size:.88rem; color: var(--green-dim); line-height:1.4;">
        {task.title}
      </p>
      {task.description && (
        <p class="line-clamp-2 mb-2" style="font-size:.76rem; color: var(--green-faint);">
          {task.description}
        </p>
      )}
      <PriorityBadge priority={task.priority} />
    </a>
  </div>
);

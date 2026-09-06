import { useRef, useState } from "preact/hooks";
import { PriorityBadge } from "../components/Badge.tsx";
import type { Priority, Status } from "../components/Badge.tsx";

interface Task {
  id: number;
  title: string;
  description?: string | null;
  status: Status;
  priority: Priority;
  due_date?: string | null;
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
  { status: "todo", label: "TODO", accentColor: "var(--green-mute)" },
  { status: "in_progress", label: "ACTIVE", accentColor: "var(--cyan)" },
  { status: "done", label: "DONE", accentColor: "var(--green)" },
];

export default function KanbanBoard({ tasks: initial, projectId }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overColumn, setOverColumn] = useState<Status | null>(null);
  // Which column the narrow layout is showing. Dragging cards between columns
  // is a pointer gesture with nowhere to go on a phone, so there the board
  // collapses to one column plus a per-card status select.
  const [mobileColumn, setMobileColumn] = useState<Status>("todo");
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

  // Both layouts are rendered and one is hidden by a media query, rather than
  // measured with matchMedia: the server cannot know the viewport, so choosing
  // in JS would flash the wrong board on first paint.
  return (
    <>
      <MobileBoard
        tasks={tasks}
        projectId={projectId}
        column={mobileColumn}
        onColumn={setMobileColumn}
        onMove={move}
      />
      <DesktopBoard
        tasks={tasks}
        projectId={projectId}
        draggingId={draggingId}
        setDraggingId={setDraggingId}
        overColumn={overColumn}
        setOverColumn={setOverColumn}
        onMove={move}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Wide layout — three columns, drag and drop
// ---------------------------------------------------------------------------

function DesktopBoard(
  {
    tasks,
    projectId,
    draggingId,
    setDraggingId,
    overColumn,
    setOverColumn,
    onMove,
  }: {
    tasks: Task[];
    projectId: number;
    draggingId: number | null;
    setDraggingId: (id: number | null) => void;
    overColumn: Status | null;
    setOverColumn: (s: Status | null) => void;
    onMove: (id: number, status: Status) => void;
  },
) {
  return (
    <div class="t-kan-desktop grid grid-cols-3 gap-5 items-start">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        const isOver = overColumn === col.status;

        return (
          <div
            key={col.status}
            class="t-kan-col"
            style={isOver
              ? "background: rgba(0,255,65,.03); transition: background 150ms;"
              : ""}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer!.dropEffect = "move";
              setOverColumn(col.status);
            }}
            onDragLeave={(e) => {
              if (
                !(e.currentTarget as HTMLElement).contains(
                  e.relatedTarget as Node,
                )
              ) {
                setOverColumn(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOverColumn(null);
              const id = Number(e.dataTransfer!.getData("text/plain"));
              if (id) onMove(id, col.status);
            }}
          >
            <div class="t-kan-col-hd" style={`color: ${col.accentColor};`}>
              <span>{col.label}</span>
              <span style="font-size:.8rem; color: var(--green-faint);">
                [{colTasks.length}]
              </span>
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
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverColumn(null);
                      }}
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
      <p
        class="mb-2"
        style="font-size:.88rem; color: var(--green-dim); line-height:1.4;"
      >
        {task.title}
      </p>
      {task.description && (
        <p
          class="line-clamp-2 mb-2"
          style="font-size:.76rem; color: var(--green-faint);"
        >
          {task.description}
        </p>
      )}
      {task.due_date && (() => {
        const isOverdue = task.status !== "done" &&
          task.due_date! < new Date().toISOString().split("T")[0];
        return (
          <p
            class="mb-2"
            style={`font-size:.7rem; letter-spacing:.1em; ${
              isOverdue ? "color: var(--red);" : "color: var(--green-faint);"
            }`}
          >
            DUE: {task.due_date}
            {isOverdue ? " [OVERDUE]" : ""}
          </p>
        );
      })()}
      <PriorityBadge priority={task.priority} />
    </a>
  </div>
);

// ---------------------------------------------------------------------------
// Narrow layout — one column at a time, status changed from a select
// ---------------------------------------------------------------------------

function MobileBoard(
  { tasks, projectId, column, onColumn, onMove }: {
    tasks: Task[];
    projectId: number;
    column: Status;
    onColumn: (s: Status) => void;
    onMove: (id: number, status: Status) => void;
  },
) {
  const colTasks = tasks.filter((t) => t.status === column);
  const accent = COLUMNS.find((c) => c.status === column)!.accentColor;

  return (
    <div class="t-kan-mobile">
      <select
        class="t-input t-select t-kan-picker"
        style={`color: ${accent};`}
        value={column}
        onChange={(e) =>
          onColumn((e.target as HTMLSelectElement).value as Status)}
      >
        {COLUMNS.map((col) => (
          <option key={col.status} value={col.status}>
            {col.label} [{tasks.filter((t) => t.status === col.status).length}]
          </option>
        ))}
      </select>

      {colTasks.length === 0
        ? <div class="t-kan-empty">EMPTY</div>
        : (
          <div class="flex flex-col gap-2">
            {colTasks.map((task) => (
              <MobileCard
                key={task.id}
                task={task}
                projectId={projectId}
                onMove={onMove}
              />
            ))}
          </div>
        )}
    </div>
  );
}

const MobileCard = (
  { task, projectId, onMove }: {
    task: Task;
    projectId: number;
    onMove: (id: number, status: Status) => void;
  },
) => (
  <div class="t-kan-card-m">
    {
      /* The select sits outside the link: nesting a control inside an anchor
        makes every tap on it navigate instead. */
    }
    <a
      href={`/projects/${projectId}/tasks/${task.id}`}
      style="display:block; text-decoration:none;"
    >
      <p style="font-size:.92rem; color: var(--green-dim); line-height:1.45;">
        {task.title}
      </p>
      {task.description && (
        <p
          class="line-clamp-2 mt-1"
          style="font-size:.78rem; color: var(--green-faint);"
        >
          {task.description}
        </p>
      )}
      {task.due_date && (
        <p
          class="mt-1"
          style={`font-size:.72rem; letter-spacing:.1em; ${
            isOverdue(task)
              ? "color: var(--red);"
              : "color: var(--green-faint);"
          }`}
        >
          DUE: {task.due_date}
          {isOverdue(task) ? " [OVERDUE]" : ""}
        </p>
      )}
    </a>

    <div class="t-kan-card-m-foot">
      <PriorityBadge priority={task.priority} />
      <select
        class="t-input t-select t-kan-status"
        style={`color: ${
          COLUMNS.find((c) => c.status === task.status)!.accentColor
        };`}
        value={task.status}
        onChange={(e) =>
          onMove(task.id, (e.target as HTMLSelectElement).value as Status)}
      >
        {COLUMNS.map((col) => (
          <option key={col.status} value={col.status}>{col.label}</option>
        ))}
      </select>
    </div>
  </div>
);

function isOverdue(task: Task): boolean {
  return Boolean(
    task.due_date && task.status !== "done" &&
      task.due_date < new Date().toISOString().split("T")[0],
  );
}

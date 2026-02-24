export type Priority = "low" | "medium" | "high";
export type Status = "todo" | "in_progress" | "done";

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-zinc-700 text-zinc-300",
  medium: "bg-amber-500/20 text-amber-300",
  high: "bg-red-500/20 text-red-400",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const STATUS_STYLES: Record<Status, string> = {
  todo: "bg-zinc-700 text-zinc-300",
  in_progress: "bg-blue-500/20 text-blue-300",
  done: "bg-emerald-500/20 text-emerald-400",
};

const STATUS_LABELS: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        PRIORITY_STYLES[priority]
      }`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        STATUS_STYLES[status]
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

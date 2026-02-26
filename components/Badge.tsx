export type Priority = "low" | "medium" | "high";
export type Status = "todo" | "in_progress" | "done";

const PRIORITY_CLASS: Record<Priority, string> = {
  low:    "t-badge t-badge-muted",
  medium: "t-badge t-badge-amber",
  high:   "t-badge t-badge-red",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low:    "LOW",
  medium: "MED",
  high:   "HIGH",
};

const STATUS_CLASS: Record<Status, string> = {
  todo:        "t-badge t-badge-muted",
  in_progress: "t-badge t-badge-cyan",
  done:        "t-badge t-badge-green",
};

const STATUS_LABELS: Record<Status, string> = {
  todo:        "TODO",
  in_progress: "ACTIVE",
  done:        "DONE",
};

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span class={PRIORITY_CLASS[priority]}>
    {PRIORITY_LABELS[priority]}
  </span>
);

export const StatusBadge = ({ status }: { status: Status }) => (
  <span class={STATUS_CLASS[status]}>
    {STATUS_LABELS[status]}
  </span>
);

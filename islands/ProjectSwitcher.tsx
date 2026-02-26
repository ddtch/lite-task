import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import type { Project } from "../db/queries.ts";

interface Props {
  projects: Project[];
  currentProjectId?: number;
}

type Panel = "list" | "create";

export default function ProjectSwitcher({ projects, currentProjectId }: Props) {
  const open = useSignal(false);
  const panel = useSignal<Panel>("list");
  const loading = useSignal(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = projects.find((p) => p.id === currentProjectId);
  const label = current?.name?.toUpperCase() ?? "PROJECTS";

  useEffect(() => {
    if (!open.value) return;
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open.value]);

  function close() {
    open.value = false;
    panel.value = "list";
  }

  function toggle() {
    if (open.value) {
      close();
    } else {
      panel.value = "list";
      open.value = true;
    }
  }

  function handleCreateSubmit(e: SubmitEvent) {
    const form = e.target as HTMLFormElement;
    const name = (form.elements.namedItem("name") as HTMLInputElement)?.value.trim();
    if (!name) {
      e.preventDefault();
      return;
    }
    loading.value = true;
  }

  return (
    <div ref={ref} style="position:relative;">
      <button
        type="button"
        onClick={toggle}
        style={`
          font-family: 'VT323', monospace;
          font-size: 1rem;
          letter-spacing: .1em;
          text-transform: uppercase;
          background: ${open.value ? "rgba(0,255,65,.08)" : "transparent"};
          border: 1px solid ${open.value ? "var(--b1)" : "var(--b0)"};
          color: ${open.value ? "var(--green)" : "var(--green-dim)"};
          padding: 4px 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          max-width: 200px;
        `}
      >
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{label}</span>
        <svg
          style={`width:10px; height:10px; flex-shrink:0; transition:transform 150ms; transform:${open.value ? "rotate(180deg)" : "none"};`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open.value && (
        <div class="t-dropdown">
          {panel.value === "list"
            ? (
              <ListPanel
                projects={projects}
                currentProjectId={currentProjectId}
                onCreateClick={() => (panel.value = "create")}
                onSelect={close}
              />
            )
            : (
              <CreatePanel
                loading={loading.value}
                onBack={() => (panel.value = "list")}
                onSubmit={handleCreateSubmit}
              />
            )}
        </div>
      )}
    </div>
  );
}

const ListPanel = ({
  projects,
  currentProjectId,
  onCreateClick,
  onSelect,
}: {
  projects: Project[];
  currentProjectId?: number;
  onCreateClick: () => void;
  onSelect: () => void;
}) => (
  <div>
    <div style="padding: 6px 12px; font-size:.7rem; letter-spacing:.2em; color: var(--green-faint); border-bottom: 1px solid var(--b0);">
      SELECT_PROJECT
    </div>
    <div style="max-height: 260px; overflow-y: auto; padding: 4px 0;">
      {projects.length === 0
        ? (
          <p style="padding: 12px 16px; font-size:.8rem; color: var(--green-faint); letter-spacing:.1em;">
            NO_RECORDS
          </p>
        )
        : projects.map((p) => {
          const active = p.id === currentProjectId;
          return (
            <a
              key={p.id}
              href={`/projects/${p.id}`}
              onClick={onSelect}
              style={`
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 16px;
                font-family: 'Share Tech Mono', monospace;
                font-size: .82rem;
                text-decoration: none;
                background: ${active ? "rgba(0,255,65,.08)" : "transparent"};
                color: ${active ? "var(--green)" : "var(--green-dim)"};
                transition: background 100ms, color 100ms;
              `}
            >
              <span style="width:14px; text-align:center; font-family:'VT323',monospace; color:var(--green-dim);">
                {active ? ">" : ""}
              </span>
              <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-transform:uppercase;">
                {p.name}
              </span>
              <span style="font-size:.7rem; color: var(--green-faint);">{p.task_count ?? 0}</span>
            </a>
          );
        })}
    </div>

    <div style="border-top: 1px solid var(--b0);">
      <button
        type="button"
        onClick={onCreateClick}
        style="
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          font-family: 'VT323', monospace;
          font-size: .95rem;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--green-mute);
          background: transparent;
          border: none;
          cursor: pointer;
          text-align: left;
        "
      >
        <span style="color: var(--green-dim); font-size:1.1rem;">+</span>
        NEW_PROJECT
      </button>
    </div>
  </div>
);

const CreatePanel = ({
  loading,
  onBack,
  onSubmit,
}: {
  loading: boolean;
  onBack: () => void;
  onSubmit: (e: SubmitEvent) => void;
}) => (
  <div>
    <div style="display:flex; align-items:center; gap:8px; padding: 8px 12px; border-bottom: 1px solid var(--b0);">
      <button
        type="button"
        onClick={onBack}
        style="background:none; border:none; cursor:pointer; padding:2px 4px; color: var(--green-faint); font-family:'VT323',monospace; font-size:1.1rem;"
        title="Back"
      >
        ←
      </button>
      <span style="font-family:'VT323',monospace; font-size:.85rem; letter-spacing:.15em; color:var(--green-mute);">
        INIT_PROJECT
      </span>
    </div>

    <form
      method="POST"
      action="/projects"
      onSubmit={onSubmit}
      style="padding: 12px; display:flex; flex-direction:column; gap:10px;"
    >
      <input
        type="text"
        name="name"
        required
        autofocus
        placeholder="project_name..."
        class="t-input"
        style="font-size:.85rem;"
      />
      <textarea
        name="description"
        rows={2}
        placeholder="// description (optional)"
        class="t-input"
        style="font-size:.85rem;"
      />
      <button
        type="submit"
        disabled={loading}
        class="t-btn t-btn-primary"
        style="width:100%; justify-content:center;"
      >
        {loading ? "CREATING..." : "EXECUTE"}
      </button>
    </form>
  </div>
);

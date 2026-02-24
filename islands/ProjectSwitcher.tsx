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
  const label = current?.name ?? "Projects";

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open.value) return;
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        close();
      }
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
    const name = (
      form.elements.namedItem("name") as HTMLInputElement
    )?.value.trim();
    if (!name) {
      e.preventDefault();
      return;
    }
    loading.value = true;
    // Let the native form POST through — server redirects to new project
  }

  return (
    <div ref={ref} class="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={toggle}
        class={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors max-w-[200px] ${
          open.value
            ? "bg-zinc-700 text-white"
            : "text-zinc-300 hover:text-white hover:bg-zinc-800"
        }`}
      >
        <span class="truncate">{label}</span>
        <svg
          class={`w-3 h-3 shrink-0 transition-transform ${
            open.value ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open.value && (
        <div class="absolute left-0 top-full mt-1.5 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50">
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

// ---------------------------------------------------------------------------
// List panel
// ---------------------------------------------------------------------------

function ListPanel({
  projects,
  currentProjectId,
  onCreateClick,
  onSelect,
}: {
  projects: Project[];
  currentProjectId?: number;
  onCreateClick: () => void;
  onSelect: () => void;
}) {
  return (
    <div>
      {/* Project list */}
      <div class="py-1 max-h-64 overflow-y-auto">
        {projects.length === 0
          ? (
            <p class="px-4 py-3 text-xs text-zinc-500">No projects yet</p>
          )
          : projects.map((p) => {
            const active = p.id === currentProjectId;
            return (
              <a
                key={p.id}
                href={`/projects/${p.id}`}
                onClick={onSelect}
                class={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-violet-500/15 text-violet-300"
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                {/* Check / dot indicator */}
                <span class="w-4 shrink-0 text-center">
                  {active ? "✓" : ""}
                </span>
                <span class="truncate flex-1">{p.name}</span>
                <span class="text-xs text-zinc-600 shrink-0">
                  {p.task_count ?? 0}
                </span>
              </a>
            );
          })}
      </div>

      {/* Divider + create button */}
      <div class="border-t border-zinc-800">
        <button
          type="button"
          onClick={onCreateClick}
          class="w-full flex items-center gap-2 px-4 py-3 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-left"
        >
          <span class="text-violet-400 font-bold text-base leading-none">+</span>
          New Project
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create panel (inline form)
// ---------------------------------------------------------------------------

function CreatePanel({
  loading,
  onBack,
  onSubmit,
}: {
  loading: boolean;
  onBack: () => void;
  onSubmit: (e: SubmitEvent) => void;
}) {
  return (
    <div>
      {/* Header */}
      <div class="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          class="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
          title="Back"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <span class="text-sm font-medium text-zinc-300">New Project</span>
      </div>

      {/* Form */}
      <form
        method="POST"
        action="/projects"
        onSubmit={onSubmit}
        class="p-3 space-y-3"
      >
        <div>
          <input
            type="text"
            name="name"
            required
            autofocus
            placeholder="Project name…"
            class="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
          />
        </div>
        <div>
          <textarea
            name="description"
            rows={2}
            placeholder="Description (optional)"
            class="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          class="w-full py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? "Creating…" : "Create Project"}
        </button>
      </form>
    </div>
  );
}

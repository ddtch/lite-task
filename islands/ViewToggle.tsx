import { useEffect } from "preact/hooks";

interface Props {
  projectId: number;
  currentView: "list" | "board";
  hasViewParam: boolean;
}

export default function ViewToggle({ projectId, currentView, hasViewParam }: Props) {
  const storageKey = `lt_view_${projectId}`;

  useEffect(() => {
    if (hasViewParam) {
      localStorage.setItem(storageKey, currentView);
    } else {
      const stored = localStorage.getItem(storageKey) as "list" | "board" | null;
      if (stored && stored !== currentView) {
        window.location.replace(`/projects/${projectId}?view=${stored}`);
      }
    }
  }, []);

  return (
    <div class="t-view-toggle shrink-0">
      <a
        href={`/projects/${projectId}?view=list`}
        class={`t-view-btn ${currentView === "list" ? "active" : ""}`}
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        LIST
      </a>
      <a
        href={`/projects/${projectId}?view=board`}
        class={`t-view-btn ${currentView === "board" ? "active" : ""}`}
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        BOARD
      </a>
    </div>
  );
}

import { useSignal } from "@preact/signals";

export default function ProjectCreateModal() {
  const open = useSignal(false);
  const loading = useSignal(false);

  function handleSubmit(e: SubmitEvent) {
    const form = e.target as HTMLFormElement;
    const title = (form.elements.namedItem("name") as HTMLInputElement)?.value.trim();
    if (!title) {
      e.preventDefault();
      return;
    }
    loading.value = true;
  }

  if (!open.value) {
    return (
      <button
        type="button"
        onClick={() => (open.value = true)}
        class="t-btn t-btn-primary"
      >
        <span>+</span> NEW_PROJECT
      </button>
    );
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="t-modal-bg" onClick={() => (open.value = false)} />

      <div class="t-modal">
        {/* Header */}
        <div class="flex items-center justify-between mb-5">
          <h2 class="t-h2">INIT_PROJECT</h2>
          <button
            type="button"
            onClick={() => (open.value = false)}
            style="font-family:'VT323',monospace; font-size:1.6rem; color:var(--green-mute); background:none; border:none; cursor:pointer; line-height:1; padding:0 4px;"
          >
            ×
          </button>
        </div>

        <div
          class="mb-5 pb-1"
          style="border-bottom: 1px solid var(--b0); font-size:.72rem; letter-spacing:.2em; color: var(--green-faint);"
        >
          ENTER_PROJECT_PARAMETERS
        </div>

        <form
          method="POST"
          action="/projects"
          onSubmit={handleSubmit}
          class="flex flex-col gap-4"
        >
          <div>
            <label class="t-field-label">NAME <span style="color:var(--red);">*</span></label>
            <input
              type="text"
              name="name"
              required
              autofocus
              placeholder="project_name_here..."
              class="t-input"
            />
          </div>

          <div>
            <label class="t-field-label">DESCRIPTION</label>
            <textarea
              name="description"
              rows={3}
              placeholder="// optional description..."
              class="t-input"
            />
          </div>

          <div class="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading.value}
              class="t-btn t-btn-primary flex-1"
            >
              {loading.value ? "CREATING..." : "EXECUTE"}
            </button>
            <button
              type="button"
              onClick={() => (open.value = false)}
              class="t-btn"
            >
              ABORT
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

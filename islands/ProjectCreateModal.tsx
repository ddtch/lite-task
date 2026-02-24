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
    // let the native form POST go through
  }

  if (!open.value) {
    return (
      <button
        type="button"
        onClick={() => (open.value = true)}
        class="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <span class="text-base leading-none">+</span> New Project
      </button>
    );
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => (open.value = false)}
      />

      {/* Modal */}
      <div class="relative bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold text-white">New Project</h2>
          <button
            type="button"
            onClick={() => (open.value = false)}
            class="text-zinc-400 hover:text-zinc-200 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form
          method="POST"
          action="/projects"
          onSubmit={handleSubmit}
          class="space-y-4"
        >
          <div>
            <label class="block text-sm font-medium text-zinc-300 mb-1.5">
              Name <span class="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              autofocus
              placeholder="My awesome project..."
              class="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-zinc-300 mb-1.5">
              Description
            </label>
            <textarea
              name="description"
              rows={3}
              placeholder="What is this project about? (optional)"
              class="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors resize-none"
            />
          </div>

          <div class="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading.value}
              class="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
            >
              {loading.value ? "Creating..." : "Create Project"}
            </button>
            <button
              type="button"
              onClick={() => (open.value = false)}
              class="px-4 py-2.5 text-zinc-400 border border-zinc-600 rounded-lg hover:border-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

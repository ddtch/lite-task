import { page } from "fresh";
import { define } from "../../../../../utils.ts";
import {
  deleteTask,
  getProject,
  getTask,
  listAttachments,
  updateTask,
} from "../../../../../db/queries.ts";
import { PriorityBadge, StatusBadge } from "../../../../../components/Badge.tsx";
import VoiceRecorder from "../../../../../islands/VoiceRecorder.tsx";
import AttachmentUploader from "../../../../../islands/AttachmentUploader.tsx";
import ImageLightbox from "../../../../../islands/ImageLightbox.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const projectId = Number(ctx.params.id);
    const taskId = Number(ctx.params.taskId);
    const [project, task] = await Promise.all([getProject(projectId), getTask(taskId)]);
    if (!project || !task || task.project_id !== projectId) {
      return new Response("Not found", { status: 404 });
    }
    const attachments = await listAttachments(taskId);
    return page({ project, task, attachments });
  },

  async POST(ctx) {
    const projectId = Number(ctx.params.id);
    const taskId = Number(ctx.params.taskId);
    const form = await ctx.req.formData();
    const action = form.get("_action") as string | null;

    if (action === "delete") {
      await deleteTask(taskId);
      return new Response(null, {
        status: 303,
        headers: { Location: `/projects/${projectId}` },
      });
    }

    if (action === "status") {
      const status = form.get("status") as string;
      await updateTask(taskId, { status: status as "todo" | "in_progress" | "done" });
      return new Response(null, {
        status: 303,
        headers: {
          Location: `/projects/${projectId}/tasks/${taskId}`,
        },
      });
    }

    return new Response("Bad request", { status: 400 });
  },
});

function renderWithLinks(text: string) {
  // Split on URLs, keeping them as separate parts via capturing group
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-400 hover:text-blue-300 underline break-all"
        >
          {part}
        </a>
      )
      : part
  );
}

export default define.page<typeof handler>(function TaskDetailPage({ data }) {
  const { project, task, attachments } = data;
  const images = attachments.filter((a) => a.type === "image");
  const voices = attachments.filter((a) => a.type === "voice");
  const audios = attachments.filter((a) => a.type === "audio");
  const videos = attachments.filter((a) => a.type === "video");

  return (
    <div class="max-w-3xl">
      {/* Breadcrumb */}
      <div class="flex items-center gap-2 text-sm text-zinc-500 mb-6">
        <a href="/projects" class="hover:text-zinc-300 transition-colors">
          Projects
        </a>
        <span>/</span>
        <a
          href={`/projects/${project.id}`}
          class="hover:text-zinc-300 transition-colors"
        >
          {project.name}
        </a>
        <span>/</span>
        <span class="text-zinc-300 truncate">{task.title}</span>
      </div>

      {/* Header */}
      <div class="flex items-start gap-4 mb-6">
        <div class="flex-1">
          <h1 class="text-2xl font-bold text-white mb-3">{task.title}</h1>
          <div class="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            <span class="text-xs text-zinc-600">
              Created{" "}
              {new Date(task.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a
            href={`/projects/${project.id}/tasks/${task.id}/edit`}
            class="px-3 py-1.5 text-sm text-zinc-300 border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors"
          >
            Edit
          </a>
          <form method="POST">
            <input type="hidden" name="_action" value="delete" />
            <button
              type="submit"
              class="px-3 py-1.5 text-sm text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-500/50 rounded-lg transition-colors"
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      {/* Quick status update */}
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <p class="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-3">
          Update Status
        </p>
        <form method="POST" class="flex gap-2 flex-wrap">
          <input type="hidden" name="_action" value="status" />
          {(["todo", "in_progress", "done"] as const).map((s) => (
            <button
              key={s}
              type="submit"
              name="status"
              value={s}
              class={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                task.status === s
                  ? "bg-violet-600 border-violet-500 text-white"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              {s === "todo" ? "To Do" : s === "in_progress" ? "In Progress" : "Done"}
            </button>
          ))}
        </form>
      </div>

      {/* Description */}
      {task.description && (
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
          <p class="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-3">
            Description
          </p>
          <p class="text-zinc-300 whitespace-pre-wrap leading-relaxed">
            {renderWithLinks(task.description)}
          </p>
        </div>
      )}

      {/* Image attachments */}
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <p class="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-4">
          Images ({images.length})
        </p>
        {images.length > 0 && (
          <ImageLightbox images={images.map((a) => ({ id: a.id, filename: a.filename, original_name: a.original_name }))} />
        )}
        <AttachmentUploader taskId={task.id} type="image" />
      </div>

      {/* Audio files */}
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <p class="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-4">
          Audio ({audios.length})
        </p>
        {audios.length > 0 && (
          <div class="space-y-2 mb-4">
            {audios.map((a) => (
              <div
                key={a.id}
                class="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3"
              >
                <span class="text-blue-400 text-lg">🎵</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-zinc-300 truncate">{a.original_name}</p>
                  <audio
                    src={`/api/uploads/${a.filename}`}
                    controls
                    class="w-full mt-1 h-8"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <AttachmentUploader taskId={task.id} type="audio" />
      </div>

      {/* Video files */}
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <p class="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-4">
          Video ({videos.length})
        </p>
        {videos.length > 0 && (
          <div class="space-y-3 mb-4">
            {videos.map((a) => (
              <div
                key={a.id}
                class="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden"
              >
                <video
                  src={`/api/uploads/${a.filename}`}
                  controls
                  class="w-full max-h-64"
                />
                <p class="text-xs text-zinc-500 px-3 py-2 truncate">{a.original_name}</p>
              </div>
            ))}
          </div>
        )}
        <AttachmentUploader taskId={task.id} type="video" />
      </div>

      {/* Voice memos */}
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p class="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-4">
          Voice Memos ({voices.length})
        </p>
        {voices.length > 0 && (
          <div class="space-y-2 mb-4">
            {voices.map((a) => (
              <div
                key={a.id}
                class="flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3"
              >
                <span class="text-violet-400 text-lg">🎙</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-zinc-300 truncate">{a.original_name}</p>
                  <audio
                    src={`/api/uploads/${a.filename}`}
                    controls
                    class="w-full mt-1 h-8"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <VoiceRecorder taskId={task.id} />
      </div>
    </div>
  );
});

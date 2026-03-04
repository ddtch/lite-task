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
        headers: { Location: `/projects/${projectId}/tasks/${taskId}` },
      });
    }

    return new Response("Bad request", { status: 400 });
  },
});

function renderWithLinks(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style="color: var(--cyan); text-decoration: underline; word-break: break-all;"
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
    <>
      <a
        href={`/projects/${project.id}`}
        class="t-back-sticky"
        title="Back to project"
      >
        ←
      </a>
    <div style="max-width: 48rem;">
      {/* Breadcrumb */}
      <div class="t-breadcrumb mb-5" style="font-size:.82rem; letter-spacing:.14em;">
        <a href="/projects">ROOT/PROJECTS</a>
        <span style="color: var(--b1);">/</span>
        <a href={`/projects/${project.id}`}>{project.name.toUpperCase()}</a>
        <span style="color: var(--b1);">/</span>
        <span style="color: var(--green-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">
          {task.title.toUpperCase()}
        </span>
      </div>

      {/* Header */}
      <div class="flex items-start gap-4 mb-6">
        <div style="flex:1;">
          <h1 class="t-h1 mb-3">{task.title}</h1>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            <span style="font-size:.7rem; letter-spacing:.15em; color: var(--green-faint); text-transform:uppercase;">
              CREATED:{" "}
              {new Date(task.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:stretch; gap:8px; flex-shrink:0;">
          <div style="display:flex; gap:8px;">
            <a
              href={`/projects/${project.id}/tasks/${task.id}/edit`}
              class="t-btn"
              style="flex:1; text-align:center;"
            >
              EDIT
            </a>
            <form method="POST">
              <input type="hidden" name="_action" value="delete" />
              <button type="submit" class="t-btn t-btn-danger">DEL</button>
            </form>
          </div>
          <a
            href={`/projects/${project.id}/tasks/new`}
            class="t-btn"
            style="text-align:center; color:var(--cyan); border-color:var(--cyan); display:inline-block;"
          >
            NEW TASK
          </a>
        </div>
      </div>

      {/* Status update */}
      <div class="t-panel mb-5">
        <p class="t-panel-title">SET_STATUS</p>
        <form method="POST" style="display:flex; gap:8px; flex-wrap:wrap;">
          <input type="hidden" name="_action" value="status" />
          {(["todo", "in_progress", "done"] as const).map((s) => (
            <button
              key={s}
              type="submit"
              name="status"
              value={s}
              class={`t-status-btn ${task.status === s ? "active" : ""}`}
            >
              {s === "todo" ? "TODO" : s === "in_progress" ? "ACTIVE" : "DONE"}
            </button>
          ))}
        </form>
      </div>

      {/* Description */}
      {task.description && (
        <div class="t-panel mb-4">
          <p class="t-panel-title">DESCRIPTION</p>
          <p style="font-size:.88rem; color: var(--green-dim); white-space: pre-wrap; line-height:1.6;">
            {renderWithLinks(task.description)}
          </p>
        </div>
      )}

      {/* Images */}
      <div class="t-panel mb-4">
        <p class="t-panel-title">IMAGES [{images.length}]</p>
        {images.length > 0 && (
          <ImageLightbox images={images.map((a) => ({ id: a.id, filename: a.filename, original_name: a.original_name }))} />
        )}
        <AttachmentUploader taskId={task.id} type="image" />
      </div>

      {/* Audio */}
      <div class="t-panel mb-4">
        <p class="t-panel-title">AUDIO [{audios.length}]</p>
        {audios.length > 0 && (
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            {audios.map((a) => (
              <div
                key={a.id}
                style="display:flex; align-items:center; gap:12px; background:var(--bg0); border:1px solid var(--b0); padding:10px 14px;"
              >
                <span style="color: var(--cyan); font-family:'VT323',monospace;">♪</span>
                <div style="flex:1; min-width:0;">
                  <p style="font-size:.8rem; color: var(--green-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{a.original_name}</p>
                  <audio src={`/api/uploads/${a.filename}`} controls class="w-full mt-1 h-8" />
                </div>
              </div>
            ))}
          </div>
        )}
        <AttachmentUploader taskId={task.id} type="audio" />
      </div>

      {/* Video */}
      <div class="t-panel mb-4">
        <p class="t-panel-title">VIDEO [{videos.length}]</p>
        {videos.length > 0 && (
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:12px;">
            {videos.map((a) => (
              <div
                key={a.id}
                style="background:var(--bg0); border:1px solid var(--b0); overflow:hidden;"
              >
                <video src={`/api/uploads/${a.filename}`} controls class="w-full" style="max-height:260px;" />
                <p style="font-size:.75rem; color: var(--green-faint); padding:6px 12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  {a.original_name}
                </p>
              </div>
            ))}
          </div>
        )}
        <AttachmentUploader taskId={task.id} type="video" />
      </div>

      {/* Voice memos */}
      <div class="t-panel">
        <p class="t-panel-title">VOICE_MEMOS [{voices.length}]</p>
        {voices.length > 0 && (
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            {voices.map((a) => (
              <div
                key={a.id}
                style="display:flex; align-items:center; gap:12px; background:var(--bg0); border:1px solid var(--b0); padding:10px 14px;"
              >
                <span style="color: var(--green-dim); font-family:'VT323',monospace;">◉</span>
                <div style="flex:1; min-width:0;">
                  <p style="font-size:.8rem; color: var(--green-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{a.original_name}</p>
                  <audio src={`/api/uploads/${a.filename}`} controls class="w-full mt-1 h-8" />
                </div>
              </div>
            ))}
          </div>
        )}
        <VoiceRecorder taskId={task.id} />
      </div>
    </div>
    </>
  );
});

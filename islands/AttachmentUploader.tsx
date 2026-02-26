import { useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";

type UploadType = "image" | "audio" | "video";

interface Props {
  taskId: number;
  type: UploadType;
}

const CONFIG: Record<UploadType, { accept: string; label: string; hint: string }> = {
  image: {
    accept: "image/*",
    label: "Drop an image here or",
    hint: "PNG, JPG, GIF, WebP",
  },
  audio: {
    accept: "audio/*",
    label: "Drop an audio file here or",
    hint: "MP3, M4A, WAV, OGG",
  },
  video: {
    accept: "video/*",
    label: "Drop a video file here or",
    hint: "MP4, MOV, WebM",
  },
};

export default function AttachmentUploader({ taskId, type }: Props) {
  const dragging = useSignal(false);
  const uploading = useSignal(false);
  const error = useSignal<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cfg = CONFIG[type];

  async function uploadFile(file: File) {
    error.value = null;
    uploading.value = true;

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/tasks/${taskId}/upload`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        error.value = body.error ?? "Upload failed";
        return;
      }
      globalThis.location.reload();
    } catch (err) {
      error.value = String(err);
    } finally {
      uploading.value = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragging.value = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  }

  function handleChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div>
      <div
        class={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragging.value
            ? "border-violet-500 bg-violet-500/10"
            : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/40"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          dragging.value = true;
        }}
        onDragLeave={() => (dragging.value = false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={cfg.accept}
          class="hidden"
          onChange={handleChange}
        />
        {uploading.value
          ? (
            <div class="flex items-center justify-center gap-2 text-zinc-400">
              <span class="animate-spin text-lg">⏳</span>
              <span class="text-sm">Uploading...</span>
            </div>
          )
          : (
            <>
              <p class="text-zinc-400 text-sm">
                {cfg.label}{" "}
                <span class="text-violet-400 underline">browse</span>
              </p>
              <p class="text-zinc-600 text-xs mt-1">{cfg.hint}</p>
            </>
          )}
      </div>
      {error.value && (
        <p class="text-red-400 text-xs mt-2">{error.value}</p>
      )}
    </div>
  );
}

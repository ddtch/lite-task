import { useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";

interface Props {
  taskId: number;
}

type RecordingState = "idle" | "recording" | "uploading" | "done" | "error";

export default function VoiceRecorder({ taskId }: Props) {
  if (!IS_BROWSER) return null;

  const state = useSignal<RecordingState>("idle");
  const elapsed = useSignal(0);
  const errorMsg = useSignal<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function startRecording() {
    state.value = "recording";
    elapsed.value = 0;
    chunksRef.current = [];
    errorMsg.value = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/ogg;codecs=opus",
      });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);

        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        await uploadVoice(blob, mr.mimeType);
      };

      mr.start(250);

      timerRef.current = setInterval(() => {
        elapsed.value += 1;
        if (elapsed.value >= 300) stopRecording(); // 5 min max
      }, 1000);
    } catch (err) {
      state.value = "error";
      errorMsg.value = "Microphone access denied";
      console.error(err);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    state.value = "uploading";
  }

  async function uploadVoice(blob: Blob, mimeType: string) {
    state.value = "uploading";
    const ext = mimeType.includes("ogg") ? ".ogg" : ".webm";
    const file = new File([blob], `voice-memo${ext}`, { type: mimeType });
    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch(`/api/tasks/${taskId}/upload`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(body.error ?? "Upload failed");
      }
      state.value = "done";
      // Reload so the new voice memo appears
      setTimeout(() => globalThis.location.reload(), 800);
    } catch (err) {
      state.value = "error";
      errorMsg.value = String(err);
    }
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  return (
    <div>
      {state.value === "idle" && (
        <button
          type="button"
          onClick={startRecording}
          class="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-white text-sm font-medium rounded-lg transition-colors"
        >
          <span class="text-red-400">●</span> Record Voice Memo
        </button>
      )}

      {state.value === "recording" && (
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 text-sm text-zinc-300">
            <span class="text-red-400 animate-pulse text-lg">●</span>
            Recording <span class="font-mono text-white">{formatTime(elapsed.value)}</span>
          </div>
          <button
            type="button"
            onClick={stopRecording}
            class="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Stop
          </button>
        </div>
      )}

      {state.value === "uploading" && (
        <div class="flex items-center gap-2 text-zinc-400 text-sm">
          <span class="animate-spin">⏳</span> Uploading voice memo...
        </div>
      )}

      {state.value === "done" && (
        <div class="flex items-center gap-2 text-emerald-400 text-sm">
          <span>✓</span> Voice memo saved! Reloading...
        </div>
      )}

      {state.value === "error" && (
        <div class="space-y-2">
          <p class="text-red-400 text-sm">
            {errorMsg.value ?? "Something went wrong"}
          </p>
          <button
            type="button"
            onClick={() => {
              state.value = "idle";
              errorMsg.value = null;
            }}
            class="text-xs text-zinc-400 hover:text-zinc-200 underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

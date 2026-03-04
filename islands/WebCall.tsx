import { useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";

type CallState = "idle" | "connecting" | "active" | "ended" | "error";

export default function WebCall() {
  if (!IS_BROWSER) return null;

  const state = useSignal<CallState>("idle");
  const elapsed = useSignal(0);
  const transcript = useSignal<Array<{ role: string; content: string }>>([]);
  const errorMsg = useSignal<string | null>(null);
  // deno-lint-ignore no-explicit-any
  const clientRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function startCall() {
    state.value = "connecting";
    errorMsg.value = null;
    transcript.value = [];

    try {
      const res = await fetch("/api/voice/web-call", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(body.error ?? "Failed to create call");
      }
      const { access_token } = await res.json();

      const { RetellWebClient } = await import("retell-client-js-sdk");
      const retellClient = new RetellWebClient();
      clientRef.current = retellClient;

      retellClient.on("call_started", () => {
        state.value = "active";
        elapsed.value = 0;
        timerRef.current = setInterval(() => {
          elapsed.value += 1;
        }, 1000);
      });

      retellClient.on("call_ended", () => {
        state.value = "ended";
        if (timerRef.current) clearInterval(timerRef.current);
      });

      // deno-lint-ignore no-explicit-any
      retellClient.on("update", (update: any) => {
        if (update.transcript) {
          transcript.value = [...update.transcript];
        }
      });

      // deno-lint-ignore no-explicit-any
      retellClient.on("error", (err: any) => {
        state.value = "error";
        errorMsg.value = String(err);
        if (timerRef.current) clearInterval(timerRef.current);
      });

      await retellClient.startCall({ accessToken: access_token });
    } catch (err) {
      state.value = "error";
      errorMsg.value = err instanceof Error ? err.message : String(err);
    }
  }

  function endCall() {
    clientRef.current?.stopCall();
    state.value = "ended";
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function resetCall() {
    state.value = "idle";
    transcript.value = [];
    elapsed.value = 0;
    errorMsg.value = null;
  }

  return (
    <div class="t-card" style="border-color: var(--b1);">
      {/* Idle */}
      {state.value === "idle" && (
        <div class="text-center py-6">
          <div
            class="text-4xl mb-4"
            style="color: var(--green-dim);"
          >
            ◉
          </div>
          <p
            class="mb-4"
            style="font-size:.82rem; letter-spacing:.18em; color: var(--green-mute);"
          >
            VOICE AGENT READY
          </p>
          <button
            type="button"
            onClick={startCall}
            class="t-btn t-btn-primary"
          >
            START CALL
          </button>
        </div>
      )}

      {/* Connecting */}
      {state.value === "connecting" && (
        <div class="text-center py-6">
          <div
            class="text-2xl mb-4 animate-pulse"
            style="color: var(--cyan);"
          >
            ◌ ◌ ◌
          </div>
          <p
            style="font-size:.82rem; letter-spacing:.18em; color: var(--cyan);"
          >
            CONNECTING...
          </p>
        </div>
      )}

      {/* Active call */}
      {state.value === "active" && (
        <div>
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-3">
              <span
                class="text-lg animate-pulse"
                style="color: var(--green);"
              >
                ●
              </span>
              <span
                style="font-size:.82rem; letter-spacing:.18em; color: var(--green);"
              >
                LIVE
              </span>
              <span
                class="font-mono"
                style="font-size:.95rem; color: var(--green-dim);"
              >
                {formatTime(elapsed.value)}
              </span>
            </div>
            <button
              type="button"
              onClick={endCall}
              class="t-btn"
              style="background: var(--red, #e53e3e); border-color: var(--red, #e53e3e); color: #fff;"
            >
              END CALL
            </button>
          </div>

          {/* Live transcript */}
          {transcript.value.length > 0 && (
            <div
              class="t-panel"
              style="max-height: 300px; overflow-y: auto;"
            >
              {transcript.value.map((t, i) => (
                <div key={i} class="mb-2" style="font-size:.85rem;">
                  <span
                    style={`color: ${t.role === "agent" ? "var(--cyan)" : "var(--green)"}; letter-spacing:.12em;`}
                  >
                    {t.role === "agent" ? "AGENT" : "YOU"}:
                  </span>{" "}
                  <span style="color: var(--green-dim);">{t.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ended */}
      {state.value === "ended" && (
        <div>
          <div class="flex items-center justify-between mb-4">
            <p
              style="font-size:.82rem; letter-spacing:.18em; color: var(--green-mute);"
            >
              CALL ENDED &nbsp;·&nbsp; {formatTime(elapsed.value)}
            </p>
            <button
              type="button"
              onClick={resetCall}
              class="t-btn t-btn-primary"
            >
              NEW CALL
            </button>
          </div>

          {transcript.value.length > 0 && (
            <div
              class="t-panel"
              style="max-height: 300px; overflow-y: auto;"
            >
              {transcript.value.map((t, i) => (
                <div key={i} class="mb-2" style="font-size:.85rem;">
                  <span
                    style={`color: ${t.role === "agent" ? "var(--cyan)" : "var(--green)"}; letter-spacing:.12em;`}
                  >
                    {t.role === "agent" ? "AGENT" : "YOU"}:
                  </span>{" "}
                  <span style="color: var(--green-dim);">{t.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {state.value === "error" && (
        <div class="text-center py-6">
          <p
            class="mb-4"
            style="font-size:.85rem; color: var(--red, #e53e3e);"
          >
            {errorMsg.value ?? "Something went wrong"}
          </p>
          <button
            type="button"
            onClick={resetCall}
            class="t-btn"
            style="border-color: var(--green-faint); color: var(--green-mute);"
          >
            TRY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}

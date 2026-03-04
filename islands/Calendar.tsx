import { useSignal, useComputed } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { type CalendarEvent } from "../db/queries.ts";

interface Props {
  events: CalendarEvent[];
}

const TYPE_COLORS: Record<string, { bg: string; border: string; badge: string; label: string }> = {
  event: { bg: "rgba(0,255,65,.18)", border: "#00ff41", badge: "t-badge-green", label: "EVENT" },
  note: { bg: "rgba(0,240,255,.18)", border: "#00f0ff", badge: "t-badge-cyan", label: "NOTE" },
  reminder: { bg: "rgba(255,170,0,.18)", border: "#ffaa00", badge: "t-badge-amber", label: "REMINDER" },
};

function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

const VIEW_LABELS: Record<string, string> = {
  dayGridMonth: "THIS MONTH",
  multiMonthYear: "THIS YEAR",
  timeGridWeek: "THIS WEEK",
  timeGridDay: "TODAY",
};

function toFcEvents(events: CalendarEvent[]) {
  return events.map((ev) => {
    const tc = TYPE_COLORS[ev.type] ?? TYPE_COLORS.event;
    return {
      id: String(ev.id),
      title: ev.title,
      start: ev.event_time ? `${ev.event_date}T${ev.event_time}` : ev.event_date,
      allDay: !ev.event_time,
      backgroundColor: tc.bg,
      borderColor: tc.border,
      textColor: tc.border,
      extendedProps: { type: ev.type, dbId: ev.id },
    };
  });
}

export default function Calendar({ events: initialEvents }: Props) {
  const calendarRef = useRef<HTMLDivElement>(null);
  // deno-lint-ignore no-explicit-any
  const fcRef = useRef<any>(null);
  const selectedDate = useSignal<string | null>(null);
  const selectedEvents = useSignal<CalendarEvent[]>([]);
  const allEvents = useRef<CalendarEvent[]>(initialEvents);
  const showForm = useSignal(false);
  const editingEvent = useSignal<CalendarEvent | null>(null);
  const ready = useSignal(false);
  const error = useSignal("");
  const viewType = useSignal("dayGridMonth");
  const viewStart = useSignal("");
  const viewEnd = useSignal("");
  const eventsVersion = useSignal(0);

  // Stats for the visible range
  const stats = useComputed(() => {
    const _v = eventsVersion.value; // subscribe to changes
    void _v;
    const start = viewStart.value;
    const end = viewEnd.value;
    if (!start || !end) {
      return { total: 0, events: 0, notes: 0, reminders: 0 };
    }
    const visible = allEvents.current.filter(
      (ev) => ev.event_date >= start && ev.event_date < end,
    );
    return {
      total: visible.length,
      events: visible.filter((ev) => ev.type === "event").length,
      notes: visible.filter((ev) => ev.type === "note").length,
      reminders: visible.filter((ev) => ev.type === "reminder").length,
    };
  });

  // Form fields
  const formTitle = useSignal("");
  const formDesc = useSignal("");
  const formType = useSignal<"event" | "note" | "reminder">("event");
  const formTime = useSignal("");
  const formNotifyCall = useSignal(false);
  const formSaving = useSignal(false);

  useEffect(() => {
    if (!calendarRef.current) return;
    let mounted = true;

    (async () => {
      try {
        const [
          { Calendar: FC },
          { default: dayGridPlugin },
          { default: timeGridPlugin },
          { default: interactionPlugin },
          { default: multiMonthPlugin },
        ] = await Promise.all([
          import("@fullcalendar/core"),
          import("@fullcalendar/daygrid"),
          import("@fullcalendar/timegrid"),
          import("@fullcalendar/interaction"),
          import("@fullcalendar/multimonth"),
        ]);

        if (!mounted || !calendarRef.current) return;

        const fc = new FC(calendarRef.current, {
          plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin, multiMonthPlugin],
          initialView: "dayGridMonth",
          headerToolbar: {
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,multiMonthYear,timeGridWeek,timeGridDay",
          },
          buttonText: {
            today: "TODAY",
            month: "MONTH",
            year: "YEAR",
            week: "WEEK",
            day: "DAY",
          },
          firstDay: 1,
          height: "auto",
          eventTimeFormat: { hour: "numeric", minute: "2-digit", hour12: true },
          events: toFcEvents(initialEvents),
          editable: false,
          selectable: true,
          navLinks: true,
          dayMaxEvents: 3,
          dateClick(info: { dateStr: string }) {
            if (!mounted) return;
            const dateStr = info.dateStr.slice(0, 10);
            selectedDate.value = dateStr;
            showForm.value = false;
            editingEvent.value = null;
            updateSelectedEvents(dateStr);
          },
          // deno-lint-ignore no-explicit-any
          eventClick(info: { jsEvent: Event; event: any }) {
            info.jsEvent.preventDefault();
            if (!mounted) return;
            const dateStr = info.event.startStr.slice(0, 10);
            selectedDate.value = dateStr;
            showForm.value = false;
            editingEvent.value = null;
            updateSelectedEvents(dateStr);
          },
          // deno-lint-ignore no-explicit-any
          datesSet(info: { startStr: string; endStr: string; view: any }) {
            if (!mounted) return;
            viewType.value = info.view.type;
            viewStart.value = info.startStr.slice(0, 10);
            viewEnd.value = info.endStr.slice(0, 10);
            fetchEventsForRange(info.startStr.slice(0, 10), info.endStr.slice(0, 10));
          },
        });

        fc.render();
        fcRef.current = fc;
        ready.value = true;
      } catch (err) {
        console.error("[Calendar] Init error:", err);
        error.value = err instanceof Error ? err.message : String(err);
      }
    })();

    return () => {
      mounted = false;
      if (fcRef.current) {
        fcRef.current.destroy();
        fcRef.current = null;
      }
    };
  }, []);

  function updateSelectedEvents(dateStr: string) {
    selectedEvents.value = allEvents.current.filter(
      (ev) => ev.event_date === dateStr,
    );
  }

  async function fetchEventsForRange(start: string, end: string) {
    const startMonth = start.slice(0, 7);
    const endMonth = end.slice(0, 7);
    const months = new Set([startMonth, endMonth]);
    const startDate = new Date(start);
    const endDate = new Date(end);
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const key = `${cur.getFullYear()}-${(cur.getMonth() + 1).toString().padStart(2, "0")}`;
      months.add(key);
      cur.setMonth(cur.getMonth() + 1);
    }

    const allFetched: CalendarEvent[] = [];
    for (const m of months) {
      const res = await fetch(`/api/events?month=${m}`);
      if (res.ok) {
        const data: CalendarEvent[] = await res.json();
        allFetched.push(...data);
      }
    }

    const seen = new Set<number>();
    const unique = allFetched.filter((ev) => {
      if (seen.has(ev.id)) return false;
      seen.add(ev.id);
      return true;
    });

    allEvents.current = unique;

    if (fcRef.current) {
      fcRef.current.removeAllEvents();
      for (const ev of toFcEvents(unique)) {
        fcRef.current.addEvent(ev);
      }
    }

    eventsVersion.value++;

    if (selectedDate.value) {
      updateSelectedEvents(selectedDate.value);
    }
  }

  async function handleCreate() {
    if (!formTitle.value.trim() || !selectedDate.value) return;
    formSaving.value = true;
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.value.trim(),
          description: formDesc.value.trim(),
          event_date: selectedDate.value,
          event_time: formTime.value || null,
          type: formType.value,
          notify_call: formNotifyCall.value,
        }),
      });
      if (res.ok) {
        resetForm();
        await refetchCurrent();
      }
    } finally {
      formSaving.value = false;
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (res.ok) {
      editingEvent.value = null;
      showForm.value = false;
      await refetchCurrent();
    }
  }

  function startEdit(ev: CalendarEvent) {
    formTitle.value = ev.title;
    formDesc.value = ev.description;
    formType.value = ev.type;
    formTime.value = ev.event_time ?? "";
    formNotifyCall.value = ev.notify_call === 1;
    editingEvent.value = ev;
    showForm.value = true;
  }

  function resetForm() {
    formTitle.value = "";
    formDesc.value = "";
    formType.value = "event";
    formTime.value = "";
    formNotifyCall.value = false;
    editingEvent.value = null;
    showForm.value = false;
  }

  async function handleUpdate() {
    const ev = editingEvent.value;
    if (!ev || !formTitle.value.trim()) return;
    formSaving.value = true;
    try {
      const res = await fetch(`/api/events/${ev.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.value.trim(),
          description: formDesc.value.trim(),
          event_date: selectedDate.value,
          event_time: formTime.value || null,
          type: formType.value,
          notify_call: formNotifyCall.value,
        }),
      });
      if (res.ok) {
        resetForm();
        await refetchCurrent();
      }
    } finally {
      formSaving.value = false;
    }
  }

  async function refetchCurrent() {
    if (!fcRef.current) return;
    const view = fcRef.current.view;
    await fetchEventsForRange(
      view.activeStart.toISOString().slice(0, 10),
      view.activeEnd.toISOString().slice(0, 10),
    );
  }

  return (
    <div class="cal-layout">
      {/* Left panel — events for selected day */}
      <div class="cal-panel" style={selectedDate.value ? undefined : { opacity: 0.4 }}>
        <div class="t-card" style="padding: 1rem; height: 100%;">
          {!selectedDate.value && (
            <div style="text-align: center; padding: 2rem .5rem;">
              <div style="font-family:'VT323',monospace; font-size:1.8rem; color:var(--green-faint); margin-bottom:.5rem;">◈</div>
              <p style="font-size:.82rem; color:var(--green-faint); letter-spacing:.12em;">
                SELECT A DATE TO VIEW ENTRIES
              </p>
            </div>
          )}

          {selectedDate.value && (
            <div>
              <div class="flex items-center justify-between mb-3">
                <h3 class="t-h2" style="font-size:1.05rem; line-height:1.2;">
                  {new Date(selectedDate.value + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  }).toUpperCase()}
                </h3>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (showForm.value && !editingEvent.value) {
                        showForm.value = false;
                      } else {
                        resetForm();
                        showForm.value = true;
                      }
                    }}
                    class="t-btn t-btn-primary"
                    style="padding: 2px 10px; font-size:.9rem;"
                  >
                    + ADD
                  </button>
                  <button
                    type="button"
                    onClick={() => { selectedDate.value = null; resetForm(); }}
                    class="t-btn"
                    style="padding: 2px 8px; font-size:.9rem;"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Add event form */}
              {showForm.value && (
                <div style="border: 1px solid var(--b0); background: var(--bg2); padding: .7rem; margin-bottom: .75rem;">
                  <div style="font-family:'VT323',monospace; font-size:.75rem; letter-spacing:.2em; color:var(--green-faint); margin-bottom:.5rem; border-bottom: 1px solid var(--b0); padding-bottom:.3rem;">
                    {editingEvent.value ? "EDIT_ENTRY" : "NEW_ENTRY"}
                  </div>
                  <div class="flex flex-col gap-2">
                    <input
                      type="text"
                      value={formTitle.value}
                      onInput={(e) => (formTitle.value = (e.target as HTMLInputElement).value)}
                      placeholder="Title *"
                      class="t-input"
                      style="font-size:.82rem; padding: 5px 8px;"
                    />
                    <div class="grid grid-cols-2 gap-2">
                      <select
                        value={formType.value}
                        onChange={(e) => (formType.value = (e.target as HTMLSelectElement).value as "event" | "note" | "reminder")}
                        class="t-input t-select"
                        style="font-size:.82rem; padding: 5px 8px;"
                      >
                        <option value="event">EVENT</option>
                        <option value="note">NOTE</option>
                        <option value="reminder">REMINDER</option>
                      </select>
                      <input
                        type="time"
                        value={formTime.value}
                        onInput={(e) => (formTime.value = (e.target as HTMLInputElement).value)}
                        class="t-input"
                        style="font-size:.82rem; padding: 5px 8px;"
                      />
                    </div>
                    <textarea
                      value={formDesc.value}
                      onInput={(e) => (formDesc.value = (e.target as HTMLTextAreaElement).value)}
                      placeholder="Description (optional)"
                      rows={2}
                      class="t-input"
                      style="font-size:.82rem; padding: 5px 8px;"
                    />
                    {formTime.value && (
                      <label
                        class="flex items-center gap-2"
                        style="font-family:'VT323',monospace; font-size:.82rem; color:var(--green-dim); cursor:pointer;"
                      >
                        <input
                          type="checkbox"
                          checked={formNotifyCall.value}
                          onChange={(e) => (formNotifyCall.value = (e.target as HTMLInputElement).checked)}
                          style="accent-color: var(--green);"
                        />
                        CALL ME BEFORE EVENT
                      </label>
                    )}
                    <div class="flex gap-2">
                      <button
                        type="button"
                        onClick={editingEvent.value ? handleUpdate : handleCreate}
                        disabled={formSaving.value || !formTitle.value.trim()}
                        class="t-btn t-btn-primary flex-1"
                        style="font-size:.9rem;"
                      >
                        {formSaving.value ? "..." : editingEvent.value ? "SAVE" : "CREATE"}
                      </button>
                      <button
                        type="button"
                        onClick={resetForm}
                        class="t-btn"
                        style="font-size:.9rem;"
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Events list */}
              {selectedEvents.value.length === 0 && !showForm.value && (
                <p style="font-size:.82rem; color: var(--green-faint); letter-spacing:.12em; padding: 1rem 0; text-align:center;">
                  NO ENTRIES
                </p>
              )}

              {selectedEvents.value.length > 0 && (
                <div class="space-y-2">
                  {selectedEvents.value.map((ev) => {
                    const tc = TYPE_COLORS[ev.type] ?? TYPE_COLORS.event;
                    return (
                      <div
                        key={ev.id}
                        class="cal-event-item"
                        style="background: var(--bg2); border: 1px solid var(--b0); padding: .5rem .7rem; cursor: default;"
                      >
                        <div class="flex items-center justify-between gap-2">
                          <div class="flex items-center gap-2 min-w-0">
                            <span class={`t-badge ${tc.badge}`} style="font-size:.65rem; padding: 0 4px; white-space: nowrap;">
                              {tc.label}
                            </span>
                            {ev.event_time && (
                              <span style="font-size:.72rem; color:var(--green-mute); font-family:'VT323',monospace;">
                                {formatTime12h(ev.event_time)}
                              </span>
                            )}
                            {ev.notify_call === 1 && (
                              <span class="t-badge t-badge-amber" style="font-size:.6rem; padding: 0 3px;">
                                CALL
                              </span>
                            )}
                          </div>
                          <div class="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(ev)}
                              style="font-family:'VT323',monospace; font-size:.75rem; color:var(--green-mute); opacity:.6; background:none; border:none; cursor:pointer; padding:2px 4px; line-height:1;"
                            >
                              EDIT
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(ev.id)}
                              class="cal-delete-btn"
                              style="font-family:'VT323',monospace; font-size:1rem; color:var(--red); opacity:.5; background:none; border:none; cursor:pointer; padding:2px 4px; line-height:1;"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        <p class="truncate mt-1" style="font-size:.85rem; color:var(--green-dim);">
                          {ev.title}
                        </p>
                        {ev.description && (
                          <p class="line-clamp-2 mt-1" style="font-size:.75rem; color:var(--green-mute);">
                            {ev.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right — FullCalendar */}
      <div class="cal-main">
        {/* Stats bar */}
        {ready.value && (
          <div class="flex items-center gap-4 mb-4 flex-wrap" style="border: 1px solid var(--b0); background: var(--bg1); padding: .6rem 1rem;">
            <span
              style="font-family:'VT323',monospace; font-size:.85rem; letter-spacing:.18em; color:var(--green-mute); text-transform:uppercase;"
            >
              {VIEW_LABELS[viewType.value] ?? "VIEW"}:
            </span>
            <div class="flex items-center gap-4">
              <span style="font-family:'VT323',monospace; font-size:1.1rem; color:var(--green); display:flex; align-items:center; gap:4px;">
                {stats.value.total}
                <span style="font-size:.78rem; color:var(--green-mute); letter-spacing:.1em;">TOTAL</span>
              </span>
              {stats.value.events > 0 && (
                <span style="font-family:'VT323',monospace; font-size:1.1rem; color:#00ff41; display:flex; align-items:center; gap:4px;">
                  {stats.value.events}
                  <span style="font-size:.78rem; color:var(--green-mute); letter-spacing:.1em;">EVENTS</span>
                </span>
              )}
              {stats.value.notes > 0 && (
                <span style="font-family:'VT323',monospace; font-size:1.1rem; color:#00f0ff; display:flex; align-items:center; gap:4px;">
                  {stats.value.notes}
                  <span style="font-size:.78rem; color:var(--green-mute); letter-spacing:.1em;">NOTES</span>
                </span>
              )}
              {stats.value.reminders > 0 && (
                <span style="font-family:'VT323',monospace; font-size:1.1rem; color:#ffaa00; display:flex; align-items:center; gap:4px;">
                  {stats.value.reminders}
                  <span style="font-size:.78rem; color:var(--green-mute); letter-spacing:.1em;">REMINDERS</span>
                </span>
              )}
              {stats.value.total === 0 && (
                <span style="font-size:.82rem; color:var(--green-faint); letter-spacing:.1em; font-family:'VT323',monospace;">
                  NO ENTRIES
                </span>
              )}
            </div>
          </div>
        )}

        {!ready.value && !error.value && (
          <div style="text-align:center; padding: 3rem 1rem;">
            <p style="font-family:'VT323',monospace; font-size:1.2rem; color:var(--green-mute); letter-spacing:.15em; animation: blink 1.5s step-end infinite;">
              INITIALIZING CALENDAR...
            </p>
          </div>
        )}
        {error.value && (
          <div class="t-error" style="margin: 1rem 0;">
            CALENDAR ERROR: {error.value}
          </div>
        )}
        <div ref={calendarRef} class="fc-terminal" />
      </div>
    </div>
  );
}

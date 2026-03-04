import { page } from "fresh";
import { define } from "../utils.ts";
import { listEvents } from "../db/queries.ts";
import Calendar from "../islands/Calendar.tsx";

export const handler = define.handlers({
  async GET() {
    const now = new Date();
    const month = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
    const events = await listEvents({ month });
    return page({ events });
  },
});

export default define.page<typeof handler>(function CalendarPage({ data }) {
  return (
    <div>
      <div class="mb-8">
        <div class="t-breadcrumb mb-2" style="font-size:.82rem; letter-spacing:.18em;">
          <span style="color: var(--green-mute);">ROOT</span>
          <span style="color: var(--b1);">/</span>
          <span style="color: var(--green-dim);">CALENDAR</span>
        </div>
        <h1 class="t-h1">
          CALENDAR
          <span class="t-cursor" />
        </h1>
        <p class="mt-1" style="font-size:.82rem; letter-spacing:.18em; color: var(--green-mute);">
          EVENTS · NOTES · REMINDERS
        </p>
      </div>

      <Calendar events={data.events} />
    </div>
  );
});

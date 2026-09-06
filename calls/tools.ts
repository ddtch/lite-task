/**
 * Voice agent tool definitions.
 *
 * Tools use project_name/task_title (strings) instead of IDs because voice
 * users say names, not numbers.
 *
 * These schemas are the source of truth. The agent lives in the xAI Voice Agent
 * Builder and its `/v1/agents` and `/v1/tools` APIs answer 403
 * "agents endpoint is not enabled for this team", so they cannot be pushed
 * automatically — run `deno task calls:tools` and paste the output into the
 * Builder instead. Every
 * tool is executed by routes/api/voice/tool.ts, which is why the HTTP manifest
 * points all of them at the same endpoint.
 */

/** A custom function tool as the xAI realtime API declares it. */
export interface XaiFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** The same tool, described for an agent that reaches it over HTTP. */
export interface XaiHttpTool extends XaiFunctionTool {
  url: string;
  method: "POST";
}

export function buildVoiceTools(): XaiFunctionTool[] {
  return [
    {
      type: "function",
      name: "list_projects",
      description:
        "List all projects with task counts. Call when the user asks about their projects.",
      parameters: { type: "object", properties: {} },
    },
    {
      type: "function",
      name: "list_tasks",
      description:
        "List tasks, optionally filtered by project name, status, or priority. Call when the user asks about their tasks.",
      parameters: {
        type: "object",
        properties: {
          project_name: {
            type: "string",
            description: "Project name to filter by (fuzzy match)",
          },
          status: {
            type: "string",
            enum: ["todo", "in_progress", "done"],
            description: "Filter by status",
          },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Filter by priority",
          },
        },
      },
    },
    {
      type: "function",
      name: "create_task",
      description:
        "Create a new task. Always confirm the project name and title with the user before calling.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          project_name: {
            type: "string",
            description: "Project name to add the task to",
          },
          description: { type: "string", description: "Task description" },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Priority level, defaults to medium",
          },
          due_date: {
            type: "string",
            description: "Due date in YYYY-MM-DD format (optional)",
          },
        },
        required: ["title", "project_name"],
      },
    },
    {
      type: "function",
      name: "update_task_status",
      description:
        "Update a task's status. Use when the user says they completed a task, started working on it, etc.",
      parameters: {
        type: "object",
        properties: {
          task_title: {
            type: "string",
            description: "Title or partial title of the task to update",
          },
          project_name: {
            type: "string",
            description: "Project name (helps disambiguate)",
          },
          status: {
            type: "string",
            enum: ["todo", "in_progress", "done"],
            description: "New status",
          },
        },
        required: ["task_title", "status"],
      },
    },
    {
      type: "function",
      name: "create_reminder",
      description:
        "Set a reminder. The system will call the user at the specified time. Use when the user says 'remind me about X at Y time'.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "What to remind about" },
          remind_at: {
            type: "string",
            description:
              "ISO 8601 datetime for the reminder (e.g. 2025-03-15T14:00:00)",
          },
          task_title: {
            type: "string",
            description: "Optional: task title to associate the reminder with",
          },
        },
        required: ["message", "remind_at"],
      },
    },
    {
      type: "function",
      name: "get_task_summary",
      description:
        "Get a summary of all tasks: how many todo, in progress, done, and any high-priority items.",
      parameters: { type: "object", properties: {} },
    },
    {
      type: "function",
      name: "list_events",
      description:
        "List calendar events. Call when the user asks about their schedule, upcoming events, or what's on their calendar.",
      parameters: {
        type: "object",
        properties: {
          month: {
            type: "string",
            description:
              "Month to filter by in YYYY-MM format (e.g. 2026-03). Defaults to current month.",
          },
        },
      },
    },
    {
      type: "function",
      name: "create_event",
      description:
        "Create a calendar event, note, or reminder. Timed events get a notification before the event (default 10 min); untimed events/reminders are notified at 8 AM on the event date. Phone call reminders are ON by default — set notify_call to false only if the user explicitly says they don't want a call. Set remind_before to choose timing. Set remind_interval for recurring reminders.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          event_date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
          event_time: {
            type: "string",
            description: "Time in HH:MM format (optional)",
          },
          description: { type: "string", description: "Optional description" },
          type: {
            type: "string",
            enum: ["event", "note", "reminder"],
            description: "Type of entry, defaults to event",
          },
          notify_call: {
            type: "boolean",
            description:
              "Phone call reminder — ON by default for events and reminders. Set to false only if the user explicitly opts out. Untimed events get the call at 8 AM on the event date.",
          },
          remind_before: {
            type: "number",
            description:
              "Minutes before event to notify (5, 10, 30, 60, 1440, 2880). Default: 10",
          },
          remind_interval: {
            type: "string",
            enum: ["hourly", "daily"],
            description: "Repeat reminders at this interval",
          },
        },
        required: ["title", "event_date"],
      },
    },
    {
      type: "function",
      name: "update_event",
      description:
        "Update or reschedule a calendar event by title. Use when the user wants to move an event to another day, change its time, edit the description, or enable/disable call notification. Rescheduling re-arms the reminder.",
      parameters: {
        type: "object",
        properties: {
          event_title: {
            type: "string",
            description: "Title or partial title of the event to update",
          },
          title: { type: "string", description: "New title" },
          event_date: {
            type: "string",
            description:
              "New date in YYYY-MM-DD — use this to move the event to another day",
          },
          event_time: {
            type: "string",
            description: "New time in HH:MM, or 'none' to clear",
          },
          description: { type: "string", description: "New description" },
          type: { type: "string", enum: ["event", "note", "reminder"] },
          notify_call: {
            type: "boolean",
            description: "Enable/disable phone call reminder",
          },
          remind_before: {
            type: "number",
            description: "Minutes before event to notify",
          },
          remind_interval: {
            type: "string",
            enum: ["hourly", "daily"],
            description: "Set recurring interval or 'none' to clear",
          },
        },
        required: ["event_title"],
      },
    },
  ];
}

/**
 * Tool list for an agent that calls the app over HTTP: identical schemas, each
 * pointed at the single dispatcher endpoint.
 *
 * Authentication belongs in a header — `Authorization: Bearer $VOICE_API_TOKEN`
 * — so the secret stays out of access logs. Pass `tokenInUrl` only for a tool
 * configuration that cannot set headers at all; the route accepts `?token=` as
 * that fallback.
 */
export function buildHttpTools(
  baseUrl: string,
  tokenInUrl?: string,
): XaiHttpTool[] {
  const query = tokenInUrl ? `?token=${encodeURIComponent(tokenInUrl)}` : "";
  const url = `${baseUrl}/api/voice/tool${query}`;
  return buildVoiceTools().map((tool) => ({ ...tool, url, method: "POST" }));
}

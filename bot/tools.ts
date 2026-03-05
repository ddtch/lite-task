/**
 * lite-task Telegram Bot — tool definitions + REST API executor
 *
 * Tools mirror mcp/http-client.ts but export schemas for both
 * Anthropic and OpenAI tool-calling formats.
 *
 * Also includes local tools (get_chat_messages, list_chats) that
 * read from the bot's own SQLite message store instead of the REST API.
 */

import { getMessages, listChats } from "./store.ts";
import type { MediaFile } from "./media.ts";

// ---------------------------------------------------------------------------
// Session media — set by main.ts before calling runAgent so the
// upload_attachment tool knows what file the user just sent.
// ---------------------------------------------------------------------------

let _sessionMedia: MediaFile | null = null;

export function setSessionMedia(media: MediaFile | null): void {
  _sessionMedia = media;
}

const BASE_URL = (Deno.env.get("LITE_TASK_URL") ?? "http://localhost:8011")
  .replace(/\/$/, "");

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json() as { error?: string };
      msg = j.error ?? msg;
    } catch { /* ignore */ }
    throw new Error(`${method} ${path} (${res.status}): ${msg}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Shared tool specs
// ---------------------------------------------------------------------------

interface ToolSpec {
  name: string;
  description: string;
  properties: Record<string, unknown>;
  required: string[];
}

const TOOL_SPECS: ToolSpec[] = [
  {
    name: "list_projects",
    description: "List all projects with task counts.",
    properties: {},
    required: [],
  },
  {
    name: "create_project",
    description: "Create a new project.",
    properties: {
      name: { type: "string", description: "Project name (required)" },
      description: { type: "string", description: "Optional description" },
    },
    required: ["name"],
  },
  {
    name: "get_project",
    description: "Get a project by ID, including its tasks.",
    properties: {
      id: { type: "number", description: "Project ID" },
    },
    required: ["id"],
  },
  {
    name: "update_project",
    description: "Rename a project or update its description.",
    properties: {
      id: { type: "number", description: "Project ID (required)" },
      name: { type: "string", description: "New project name (required)" },
      description: { type: "string", description: "New description (optional)" },
    },
    required: ["id", "name"],
  },
  {
    name: "delete_project",
    description: "Delete a project and all its tasks.",
    properties: {
      id: { type: "number", description: "Project ID" },
    },
    required: ["id"],
  },
  {
    name: "list_tasks",
    description: "List tasks. Optionally filter by project_id, status, or priority.",
    properties: {
      project_id: { type: "number", description: "Filter by project ID (optional)" },
      status: {
        type: "string",
        enum: ["todo", "in_progress", "done"],
        description: "Filter by status (optional)",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Filter by priority (optional)",
      },
    },
    required: [],
  },
  {
    name: "create_task",
    description: "Create a new task in a project.",
    properties: {
      project_id: { type: "number", description: "Project ID (required)" },
      title: { type: "string", description: "Task title (required)" },
      description: { type: "string", description: "Task description" },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Priority (default: medium)",
      },
      status: {
        type: "string",
        enum: ["todo", "in_progress", "done"],
        description: "Status (default: todo)",
      },
      due_date: {
        type: "string",
        description: "Due date in YYYY-MM-DD format (optional)",
      },
    },
    required: ["project_id", "title"],
  },
  {
    name: "get_task",
    description: "Get a task by ID, including its attachments.",
    properties: {
      id: { type: "number", description: "Task ID" },
    },
    required: ["id"],
  },
  {
    name: "update_task",
    description:
      "Update a task's title, description, status, priority, or due_date. Only provided fields are updated.",
    properties: {
      id: { type: "number", description: "Task ID (required)" },
      title: { type: "string", description: "New title" },
      description: { type: "string", description: "New description" },
      status: {
        type: "string",
        enum: ["todo", "in_progress", "done"],
        description: "New status",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "New priority",
      },
      due_date: {
        type: "string",
        description: "Due date in YYYY-MM-DD format, or null to clear",
      },
    },
    required: ["id"],
  },
  {
    name: "delete_task",
    description: "Delete a task and its attachments.",
    properties: {
      id: { type: "number", description: "Task ID" },
    },
    required: ["id"],
  },
  {
    name: "upload_attachment",
    description:
      "Upload the photo, voice message, or file that the user just sent to a specific task as an attachment. Call this when the user has sent a file AND either explicitly asks to attach it or previously asked to attach the next file they send.",
    properties: {
      task_id: { type: "number", description: "Task ID to attach the file to (required)" },
    },
    required: ["task_id"],
  },
  {
    name: "list_events",
    description:
      "List calendar events. Optionally filter by month (YYYY-MM) or project_id.",
    properties: {
      month: { type: "string", description: "Filter by month, e.g. '2026-03' (optional)" },
      project_id: { type: "number", description: "Filter by project ID (optional)" },
    },
    required: [],
  },
  {
    name: "create_event",
    description:
      "Create a calendar event, note, or reminder. Timed events get a notification before the event (default 10 min). Set remind_before to choose timing (5, 10, 30, 60, 1440, 2880 minutes). Set remind_interval for recurring reminders.",
    properties: {
      title: { type: "string", description: "Event title (required)" },
      description: { type: "string", description: "Optional description" },
      event_date: { type: "string", description: "Date in YYYY-MM-DD format (required)" },
      event_time: { type: "string", description: "Time in HH:MM format (optional)" },
      type: {
        type: "string",
        enum: ["event", "note", "reminder"],
        description: "Type (default: event)",
      },
      project_id: { type: "number", description: "Link to a project (optional)" },
      notify_call: { type: "boolean", description: "Enable phone call reminder 5 min before event (requires event_time)" },
      remind_before: { type: "number", description: "Minutes before event to notify (5, 10, 30, 60, 1440, 2880). Default: 10" },
      remind_interval: { type: "string", enum: ["hourly", "daily"], description: "Repeat reminder at this interval until the event (optional)" },
    },
    required: ["title", "event_date"],
  },
  {
    name: "get_event",
    description: "Get a calendar event by ID.",
    properties: {
      id: { type: "number", description: "Event ID" },
    },
    required: ["id"],
  },
  {
    name: "update_event",
    description: "Update a calendar event. Only provided fields are updated.",
    properties: {
      id: { type: "number", description: "Event ID (required)" },
      title: { type: "string" },
      description: { type: "string" },
      event_date: { type: "string", description: "YYYY-MM-DD" },
      event_time: { type: "string", description: "HH:MM or null to clear" },
      type: { type: "string", enum: ["event", "note", "reminder"] },
      project_id: { type: "number", description: "Project ID or null to unlink" },
      notify_call: { type: "boolean", description: "Enable/disable phone call reminder" },
      remind_before: { type: "number", description: "Minutes before event to notify" },
      remind_interval: { type: "string", enum: ["hourly", "daily"], description: "Set recurring interval or null to clear" },
    },
    required: ["id"],
  },
  {
    name: "delete_event",
    description: "Delete a calendar event.",
    properties: {
      id: { type: "number", description: "Event ID" },
    },
    required: ["id"],
  },
  {
    name: "list_chats",
    description:
      "List all Telegram groups and channels the bot has received messages from. Use this to find a chat_id when the user refers to a group or channel by name.",
    properties: {},
    required: [],
  },
  {
    name: "get_chat_messages",
    description:
      "Get recent messages from a Telegram group or channel that the bot is a member of. Use this to read conversation history before extracting tasks or summarising discussions.",
    properties: {
      chat_id: {
        type: "number",
        description: "Telegram chat ID (negative integer for groups/channels)",
      },
      limit: {
        type: "number",
        description: "How many recent messages to return (default: 20, max: 50)",
      },
    },
    required: ["chat_id"],
  },
];

// ---------------------------------------------------------------------------
// Provider-specific tool format exports
// ---------------------------------------------------------------------------

/** Anthropic tool format */
export const anthropicTools = TOOL_SPECS.map((spec) => ({
  name: spec.name,
  description: spec.description,
  input_schema: {
    type: "object" as const,
    properties: spec.properties,
    required: spec.required,
  },
}));

/** OpenAI tool format */
export const openaiTools = TOOL_SPECS.map((spec) => ({
  type: "function" as const,
  function: {
    name: spec.name,
    description: spec.description,
    parameters: {
      type: "object",
      properties: spec.properties,
      required: spec.required,
    },
  },
}));

// ---------------------------------------------------------------------------
// Tool executor — calls the lite-task REST API
// ---------------------------------------------------------------------------

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "list_projects": {
      const data = await api("GET", "/api/projects");
      return JSON.stringify(data, null, 2);
    }

    case "create_project": {
      const pName = String(args.name ?? "").trim();
      if (!pName) throw new Error("name is required");
      const data = await api("POST", "/api/projects", {
        name: pName,
        description: String(args.description ?? "").trim(),
      });
      return JSON.stringify(data, null, 2);
    }

    case "get_project": {
      const data = await api("GET", `/api/projects/${Number(args.id)}`);
      return JSON.stringify(data, null, 2);
    }

    case "update_project": {
      const id = Number(args.id);
      if (!id) throw new Error("id is required");
      const name = String(args.name ?? "").trim();
      if (!name) throw new Error("name is required");
      const body: Record<string, unknown> = { name };
      if (args.description !== undefined) body.description = String(args.description).trim();
      const data = await api("PUT", `/api/projects/${id}`, body);
      return JSON.stringify(data, null, 2);
    }

    case "delete_project": {
      await api("DELETE", `/api/projects/${Number(args.id)}`);
      return `Project ${args.id} deleted.`;
    }

    case "list_tasks": {
      const params = new URLSearchParams();
      if (args.project_id) params.set("project_id", String(args.project_id));
      if (args.status) params.set("status", String(args.status));
      if (args.priority) params.set("priority", String(args.priority));
      const qs = params.size > 0 ? `?${params}` : "";
      const data = await api("GET", `/api/tasks${qs}`);
      return JSON.stringify(data, null, 2);
    }

    case "create_task": {
      const title = String(args.title ?? "").trim();
      if (!title) throw new Error("title is required");
      if (!args.project_id) throw new Error("project_id is required");
      const data = await api("POST", "/api/tasks", {
        project_id: Number(args.project_id),
        title,
        description: String(args.description ?? "").trim(),
        priority: args.priority ?? "medium",
        status: args.status ?? "todo",
        due_date: args.due_date ? String(args.due_date).trim() : null,
      });
      return JSON.stringify(data, null, 2);
    }

    case "get_task": {
      const data = await api("GET", `/api/tasks/${Number(args.id)}`);
      return JSON.stringify(data, null, 2);
    }

    case "update_task": {
      const id = Number(args.id);
      if (!id) throw new Error("id is required");
      const payload: Record<string, unknown> = {};
      if (args.title !== undefined) payload.title = String(args.title).trim();
      if (args.description !== undefined) {
        payload.description = String(args.description).trim();
      }
      if (args.status !== undefined) payload.status = args.status;
      if (args.priority !== undefined) payload.priority = args.priority;
      if (args.due_date !== undefined) payload.due_date = args.due_date === null ? null : String(args.due_date).trim() || null;
      const data = await api("PUT", `/api/tasks/${id}`, payload);
      return JSON.stringify(data, null, 2);
    }

    case "delete_task": {
      await api("DELETE", `/api/tasks/${Number(args.id)}`);
      return `Task ${args.id} deleted.`;
    }

    case "upload_attachment": {
      if (!_sessionMedia) {
        throw new Error(
          "No file in the current message. The user needs to send a photo or file first.",
        );
      }
      const taskId = Number(args.task_id);
      if (!taskId) throw new Error("task_id is required");
      const form = new FormData();
      form.append(
        "file",
        new Blob([_sessionMedia.bytes as Uint8Array<ArrayBuffer>], { type: _sessionMedia.mimeType }),
        _sessionMedia.filename,
      );
      const res = await fetch(`${BASE_URL}/api/tasks/${taskId}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        let msg = res.statusText;
        try { const j = await res.json() as { error?: string }; msg = j.error ?? msg; } catch { /* ignore */ }
        throw new Error(`Upload failed (${res.status}): ${msg}`);
      }
      return JSON.stringify(await res.json(), null, 2);
    }

    case "list_events": {
      const params = new URLSearchParams();
      if (args.month) params.set("month", String(args.month));
      if (args.project_id) params.set("project_id", String(args.project_id));
      const qs = params.size > 0 ? `?${params}` : "";
      const data = await api("GET", `/api/events${qs}`);
      return JSON.stringify(data, null, 2);
    }

    case "create_event": {
      const title = String(args.title ?? "").trim();
      if (!title) throw new Error("title is required");
      if (!args.event_date) throw new Error("event_date is required");
      const data = await api("POST", "/api/events", {
        title,
        description: String(args.description ?? "").trim(),
        event_date: String(args.event_date),
        event_time: args.event_time ? String(args.event_time) : null,
        type: args.type ?? "event",
        project_id: args.project_id ? Number(args.project_id) : null,
        notify_call: Boolean(args.notify_call),
        remind_before: args.remind_before ? Number(args.remind_before) : undefined,
        remind_interval: args.remind_interval ? String(args.remind_interval) : undefined,
      });
      return JSON.stringify(data, null, 2);
    }

    case "get_event": {
      const data = await api("GET", `/api/events/${Number(args.id)}`);
      return JSON.stringify(data, null, 2);
    }

    case "update_event": {
      const id = Number(args.id);
      if (!id) throw new Error("id is required");
      const payload: Record<string, unknown> = {};
      if (args.title !== undefined) payload.title = String(args.title).trim();
      if (args.description !== undefined) payload.description = String(args.description).trim();
      if (args.event_date !== undefined) payload.event_date = String(args.event_date);
      if (args.event_time !== undefined) payload.event_time = args.event_time;
      if (args.type !== undefined) payload.type = args.type;
      if (args.project_id !== undefined) payload.project_id = args.project_id;
      if (args.notify_call !== undefined) payload.notify_call = args.notify_call;
      if (args.remind_before !== undefined) payload.remind_before = Number(args.remind_before);
      if (args.remind_interval !== undefined) payload.remind_interval = args.remind_interval;
      const data = await api("PUT", `/api/events/${id}`, payload);
      return JSON.stringify(data, null, 2);
    }

    case "delete_event": {
      await api("DELETE", `/api/events/${Number(args.id)}`);
      return `Event ${args.id} deleted.`;
    }

    case "list_chats": {
      const chats = listChats();
      if (chats.length === 0) return "No chats recorded yet. The bot must be a member of a group or channel and have received at least one message there.";
      return JSON.stringify(chats, null, 2);
    }

    case "get_chat_messages": {
      const limit = Math.min(Number(args.limit ?? 20), 50);
      const messages = getMessages(Number(args.chat_id), limit);
      if (messages.length === 0) return "No messages found for this chat. Make sure the bot is a member and has been running while messages were sent.";
      const lines = messages.map((m) => {
        const d = new Date(m.date * 1000).toISOString().slice(0, 16).replace("T", " ");
        return `[${d}] ${m.from_name}: ${m.text}`;
      });
      return lines.join("\n");
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

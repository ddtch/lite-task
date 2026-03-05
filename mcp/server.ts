/**
 * lite-task MCP Server
 *
 * Exposes task manager data as MCP tools for Claude / Claude Desktop.
 * Run with: deno task mcp
 *
 * Add to claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "lite-task": {
 *       "command": "deno",
 *       "args": ["run", "-A", "/absolute/path/to/task-light/mcp/server.ts"]
 *     }
 *   }
 * }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// We import queries directly — the db file is resolved relative to cwd
// Make sure to run `deno task mcp` from the task-light directory.
import {
  createEvent,
  createProject,
  createTask,
  deleteEvent,
  deleteProject,
  deleteTask,
  getEvent,
  getProject,
  getTask,
  listAllTasks,
  listAttachments,
  listEvents,
  listProjects,
  updateEvent,
  updateProject,
  updateTask,
} from "../db/queries.ts";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "list_projects",
    description: "List all projects with task counts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_project",
    description: "Create a new project.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name (required)" },
        description: { type: "string", description: "Optional description" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_project",
    description: "Get a project by ID, including its tasks.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Project ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_project",
    description: "Rename a project or update its description.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Project ID" },
        name: { type: "string", description: "New project name" },
        description: { type: "string", description: "New description (optional)" },
      },
      required: ["id", "name"],
    },
  },
  {
    name: "delete_project",
    description: "Delete a project and all its tasks.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Project ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_tasks",
    description:
      "List tasks. Optionally filter by project_id, status, or priority.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: {
          type: "number",
          description: "Filter by project ID (optional)",
        },
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
    },
  },
  {
    name: "create_task",
    description: "Create a new task in a project.",
    inputSchema: {
      type: "object",
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
  },
  {
    name: "get_task",
    description: "Get a task by ID, including its attachments.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Task ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_task",
    description:
      "Update a task's title, description, status, priority, or due_date. Only provided fields are updated.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Task ID (required)" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD format, or null to clear" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_task",
    description: "Delete a task and its attachments.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Task ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_attachment",
    description:
      "Download a task attachment image and return it as base64 so you can view its contents. Get the filename from get_task results (attachments[].filename).",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Attachment filename (e.g. telegram-123.jpg)",
        },
      },
      required: ["filename"],
    },
  },
  {
    name: "list_events",
    description:
      "List calendar events. Optionally filter by month (YYYY-MM) or project_id.",
    inputSchema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "Filter by month, e.g. '2026-03' (optional)",
        },
        project_id: {
          type: "number",
          description: "Filter by project ID (optional)",
        },
      },
    },
  },
  {
    name: "create_event",
    description:
      "Create a calendar event, note, or reminder. Timed events get a notification before the event (default 10 min). Set remind_before to choose timing (5, 10, 30, 60, 1440, 2880 minutes). Set remind_interval to 'hourly' or 'daily' for recurring reminders.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title (required)" },
        description: { type: "string", description: "Optional description" },
        event_date: {
          type: "string",
          description: "Date in YYYY-MM-DD format (required)",
        },
        event_time: {
          type: "string",
          description: "Time in HH:MM format (optional)",
        },
        type: {
          type: "string",
          enum: ["event", "note", "reminder"],
          description: "Type (default: event)",
        },
        project_id: {
          type: "number",
          description: "Link to a project (optional)",
        },
        notify_call: {
          type: "boolean",
          description: "Enable phone call reminder 5 min before event (requires event_time)",
        },
        remind_before: {
          type: "number",
          description: "Minutes before event to notify (5, 10, 30, 60, 1440, 2880). Default: 10",
        },
        remind_interval: {
          type: "string",
          enum: ["hourly", "daily"],
          description: "Repeat reminder at this interval until the event (optional)",
        },
      },
      required: ["title", "event_date"],
    },
  },
  {
    name: "get_event",
    description: "Get a calendar event by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Event ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_event",
    description:
      "Update a calendar event. Only provided fields are updated.",
    inputSchema: {
      type: "object",
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
  },
  {
    name: "delete_event",
    description: "Delete a calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Event ID" },
      },
      required: ["id"],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "lite-task", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: TOOLS,
}));

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function mimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return (
    { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" }[ext] ??
    "image/jpeg"
  );
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "list_projects": {
        const projects = await listProjects();
        return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
      }

      case "create_project": {
        const pName = String(a.name ?? "").trim();
        if (!pName) throw new Error("name is required");
        const id = await createProject(pName, String(a.description ?? "").trim());
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ id, name: pName }, null, 2),
          }],
        };
      }

      case "get_project": {
        const id = Number(a.id);
        const project = await getProject(id);
        if (!project) throw new Error(`Project ${id} not found`);
        const tasks = await listAllTasks({ projectId: id });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ...project, tasks }, null, 2),
          }],
        };
      }

      case "update_project": {
        const id = Number(a.id);
        const project = await getProject(id);
        if (!project) throw new Error(`Project ${id} not found`);
        const name = String(a.name ?? "").trim();
        if (!name) throw new Error("name is required");
        const description = a.description !== undefined
          ? String(a.description).trim()
          : project.description;
        await updateProject(id, name, description);
        return { content: [{ type: "text", text: JSON.stringify({ id, name, description }, null, 2) }] };
      }

      case "delete_project": {
        const id = Number(a.id);
        if (!await getProject(id)) throw new Error(`Project ${id} not found`);
        await deleteProject(id);
        return { content: [{ type: "text", text: `Project ${id} deleted.` }] };
      }

      case "list_tasks": {
        const tasks = await listAllTasks({
          projectId: a.project_id ? Number(a.project_id) : undefined,
          status: a.status ? String(a.status) : undefined,
          priority: a.priority ? String(a.priority) : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
      }

      case "create_task": {
        const title = String(a.title ?? "").trim();
        if (!title) throw new Error("title is required");
        const projectId = Number(a.project_id);
        if (!projectId) throw new Error("project_id is required");

        const validPriorities = ["low", "medium", "high"];
        const validStatuses = ["todo", "in_progress", "done"];
        const priority = validPriorities.includes(String(a.priority))
          ? (String(a.priority) as "low" | "medium" | "high")
          : "medium";
        const status = validStatuses.includes(String(a.status))
          ? (String(a.status) as "todo" | "in_progress" | "done")
          : "todo";

        const dueDate = a.due_date ? String(a.due_date).trim() : null;
        const id = await createTask(
          projectId,
          title,
          String(a.description ?? "").trim(),
          priority,
          status,
          dueDate,
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ id, title, priority, status, due_date: dueDate }, null, 2),
          }],
        };
      }

      case "get_task": {
        const id = Number(a.id);
        const task = await getTask(id);
        if (!task) throw new Error(`Task ${id} not found`);
        const attachments = await listAttachments(id);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ...task, attachments }, null, 2),
          }],
        };
      }

      case "update_task": {
        const id = Number(a.id);
        if (!await getTask(id)) throw new Error(`Task ${id} not found`);
        const validPriorities = ["low", "medium", "high"];
        const validStatuses = ["todo", "in_progress", "done"];
        await updateTask(id, {
          ...(a.title !== undefined ? { title: String(a.title).trim() } : {}),
          ...(a.description !== undefined
            ? { description: String(a.description).trim() }
            : {}),
          ...(a.priority && validPriorities.includes(String(a.priority))
            ? { priority: String(a.priority) as "low" | "medium" | "high" }
            : {}),
          ...(a.status && validStatuses.includes(String(a.status))
            ? { status: String(a.status) as "todo" | "in_progress" | "done" }
            : {}),
          ...(a.due_date !== undefined ? { due_date: a.due_date === null ? null : String(a.due_date).trim() || null } : {}),
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await getTask(id), null, 2),
          }],
        };
      }

      case "delete_task": {
        const id = Number(a.id);
        if (!await getTask(id)) throw new Error(`Task ${id} not found`);
        await deleteTask(id);
        return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
      }

      case "get_attachment": {
        const filename = String(a.filename ?? "").trim();
        if (!filename) throw new Error("filename is required");
        // Guard against path traversal
        if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
          throw new Error("Invalid filename");
        }
        const bytes = await Deno.readFile(`data/uploads/${filename}`);
        return {
          content: [{
            type: "image",
            data: bytesToBase64(bytes),
            mimeType: mimeFromFilename(filename),
          }],
        };
      }

      case "list_events": {
        const events = await listEvents({
          month: a.month ? String(a.month) : undefined,
          projectId: a.project_id ? Number(a.project_id) : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
      }

      case "create_event": {
        const title = String(a.title ?? "").trim();
        if (!title) throw new Error("title is required");
        const eventDate = String(a.event_date ?? "").trim();
        if (!eventDate) throw new Error("event_date is required");
        const validTypes = ["event", "note", "reminder"];
        const id = await createEvent({
          title,
          description: String(a.description ?? "").trim(),
          event_date: eventDate,
          event_time: a.event_time ? String(a.event_time) : null,
          type: validTypes.includes(String(a.type))
            ? (String(a.type) as "event" | "note" | "reminder")
            : "event",
          project_id: a.project_id ? Number(a.project_id) : null,
          notify_call: Boolean(a.notify_call),
          remind_before: a.remind_before ? Number(a.remind_before) : undefined,
          remind_interval: a.remind_interval ? String(a.remind_interval) : undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ id, title, event_date: eventDate }, null, 2) }],
        };
      }

      case "get_event": {
        const id = Number(a.id);
        const event = await getEvent(id);
        if (!event) throw new Error(`Event ${id} not found`);
        return { content: [{ type: "text", text: JSON.stringify(event, null, 2) }] };
      }

      case "update_event": {
        const id = Number(a.id);
        if (!await getEvent(id)) throw new Error(`Event ${id} not found`);
        const validTypes = ["event", "note", "reminder"];
        await updateEvent(id, {
          ...(a.title !== undefined ? { title: String(a.title).trim() } : {}),
          ...(a.description !== undefined ? { description: String(a.description).trim() } : {}),
          ...(a.event_date !== undefined ? { event_date: String(a.event_date) } : {}),
          ...(a.event_time !== undefined ? { event_time: a.event_time === null ? null : String(a.event_time) } : {}),
          ...(a.type && validTypes.includes(String(a.type))
            ? { type: String(a.type) as "event" | "note" | "reminder" }
            : {}),
          ...(a.project_id !== undefined ? { project_id: a.project_id === null ? null : Number(a.project_id) } : {}),
          ...(a.notify_call !== undefined ? { notify_call: a.notify_call ? 1 : 0 } : {}),
          ...(a.remind_before !== undefined ? { remind_before: Number(a.remind_before) } : {}),
          ...(a.remind_interval !== undefined ? { remind_interval: a.remind_interval === null ? null : String(a.remind_interval) } : {}),
        });
        return { content: [{ type: "text", text: JSON.stringify(await getEvent(id), null, 2) }] };
      }

      case "delete_event": {
        const id = Number(a.id);
        if (!await getEvent(id)) throw new Error(`Event ${id} not found`);
        await deleteEvent(id);
        return { content: [{ type: "text", text: `Event ${id} deleted.` }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      content: [{
        type: "text",
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);

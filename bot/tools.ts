/**
 * lite-task Telegram Bot — tool definitions + REST API executor
 *
 * Tools mirror mcp/http-client.ts but export schemas for both
 * Anthropic and OpenAI tool-calling formats.
 */

const BASE_URL = (Deno.env.get("LITE_TASK_URL") ?? "http://localhost:8000")
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
      "Update a task's title, description, status, or priority. Only provided fields are updated.",
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
      const data = await api("PUT", `/api/tasks/${id}`, payload);
      return JSON.stringify(data, null, 2);
    }

    case "delete_task": {
      await api("DELETE", `/api/tasks/${Number(args.id)}`);
      return `Task ${args.id} deleted.`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

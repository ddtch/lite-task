/**
 * lite-task MCP HTTP Client
 *
 * Connects to a running lite-task instance via its HTTP API.
 * Works with local dev, self-hosted, or Dockerized deployments.
 *
 * Configuration (env vars):
 *   LITE_TASK_URL  — base URL of your lite-task instance (default: http://localhost:5111)
 *
 * Usage:
 *   # Run directly
 *   LITE_TASK_URL=http://localhost:8011 deno run -A mcp/http-client.ts
 *
 *   # Compile to a standalone binary (no Deno needed to run)
 *   deno task compile-mcp
 *   # → produces ./lite-task-mcp binary
 *
 * Claude Desktop config (~/.config/claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "lite-task": {
 *         "command": "/path/to/lite-task-mcp",
 *         "env": { "LITE_TASK_URL": "http://localhost:8011" }
 *       }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

const BASE_URL = (Deno.env.get("LITE_TASK_URL") ?? "http://localhost:5111")
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

  if (res.status === 404) throw new Error(`Not found: ${path}`);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error ?? msg;
    } catch { /* ignore */ }
    throw new Error(`${method} ${path} failed (${res.status}): ${msg}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Tool definitions (mirrors mcp/server.ts)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "list_projects",
    description: "List all projects with task counts.",
    inputSchema: { type: "object", properties: {} },
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
      "Update a task's title, description, status, or priority. Only provided fields are updated.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Task ID (required)" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        priority: { type: "string", enum: ["low", "medium", "high"] },
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
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "lite-task", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "list_projects": {
        const data = await api("GET", "/api/projects");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_project": {
        const pName = String(a.name ?? "").trim();
        if (!pName) throw new Error("name is required");
        const data = await api("POST", "/api/projects", {
          name: pName,
          description: String(a.description ?? "").trim(),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "get_project": {
        const data = await api("GET", `/api/projects/${Number(a.id)}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "delete_project": {
        await api("DELETE", `/api/projects/${Number(a.id)}`);
        return { content: [{ type: "text", text: `Project ${a.id} deleted.` }] };
      }

      case "list_tasks": {
        const params = new URLSearchParams();
        if (a.project_id) params.set("project_id", String(a.project_id));
        if (a.status) params.set("status", String(a.status));
        if (a.priority) params.set("priority", String(a.priority));
        const qs = params.size > 0 ? `?${params}` : "";
        const data = await api("GET", `/api/tasks${qs}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_task": {
        const title = String(a.title ?? "").trim();
        if (!title) throw new Error("title is required");
        if (!a.project_id) throw new Error("project_id is required");
        const data = await api("POST", "/api/tasks", {
          project_id: Number(a.project_id),
          title,
          description: String(a.description ?? "").trim(),
          priority: a.priority ?? "medium",
          status: a.status ?? "todo",
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "get_task": {
        const data = await api("GET", `/api/tasks/${Number(a.id)}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "update_task": {
        const id = Number(a.id);
        if (!id) throw new Error("id is required");
        const payload: Record<string, unknown> = {};
        if (a.title !== undefined) payload.title = String(a.title).trim();
        if (a.description !== undefined) payload.description = String(a.description).trim();
        if (a.status !== undefined) payload.status = a.status;
        if (a.priority !== undefined) payload.priority = a.priority;
        const data = await api("PUT", `/api/tasks/${id}`, payload);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "delete_task": {
        await api("DELETE", `/api/tasks/${Number(a.id)}`);
        return { content: [{ type: "text", text: `Task ${a.id} deleted.` }] };
      }

      case "get_attachment": {
        const filename = String(a.filename ?? "").trim();
        if (!filename) throw new Error("filename is required");
        if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
          throw new Error("Invalid filename");
        }
        const res = await fetch(`${BASE_URL}/api/uploads/${encodeURIComponent(filename)}`);
        if (!res.ok) throw new Error(`Attachment not found: ${filename}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const mimeType = res.headers.get("content-type") ?? mimeFromFilename(filename);
        return {
          content: [{
            type: "image",
            data: bytesToBase64(bytes),
            mimeType,
          }],
        };
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

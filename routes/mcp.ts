/**
 * MCP Streamable HTTP endpoint
 *
 * Exposes the lite-task MCP server over HTTP so Cursor (and other MCP clients)
 * can connect with a plain URL instead of spawning a subprocess.
 *
 * Cursor config (~/.cursor/mcp.json):
 * {
 *   "mcpServers": {
 *     "lite-task": { "url": "http://localhost:8011/mcp" }
 *   }
 * }
 *
 * Stateless mode: a fresh Server + Transport is created per request.
 * No session management required.
 *
 * NOTE: MCP SDK is imported lazily inside handleMcp() to avoid Vite SSR crash
 * (ajv → json-schema-traverse is CommonJS and breaks Vite's ESM evaluator).
 */

import { define } from "../utils.ts";
import {
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  getProject,
  getTask,
  listAllTasks,
  listAttachments,
  listProjects,
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
      properties: { id: { type: "number", description: "Project ID" } },
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
      properties: { id: { type: "number", description: "Project ID" } },
      required: ["id"],
    },
  },
  {
    name: "list_tasks",
    description: "List tasks. Optionally filter by project_id, status, or priority.",
    inputSchema: {
      type: "object",
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
      properties: { id: { type: "number", description: "Task ID" } },
      required: ["id"],
    },
  },
  {
    name: "update_task",
    description: "Update a task's title, description, status, or priority. Only provided fields are updated.",
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
      properties: { id: { type: "number", description: "Task ID" } },
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

// deno-lint-ignore no-explicit-any
async function handleToolCall(name: string, a: Record<string, unknown>): Promise<any> {
  switch (name) {
    case "list_projects": {
      const projects = await listProjects();
      return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
    }
    case "create_project": {
      const pName = String(a.name ?? "").trim();
      if (!pName) throw new Error("name is required");
      const id = await createProject(pName, String(a.description ?? "").trim());
      return { content: [{ type: "text", text: JSON.stringify({ id, name: pName }, null, 2) }] };
    }
    case "get_project": {
      const id = Number(a.id);
      const project = await getProject(id);
      if (!project) throw new Error(`Project ${id} not found`);
      const tasks = await listAllTasks({ projectId: id });
      return { content: [{ type: "text", text: JSON.stringify({ ...project, tasks }, null, 2) }] };
    }
    case "update_project": {
      const id = Number(a.id);
      const project = await getProject(id);
      if (!project) throw new Error(`Project ${id} not found`);
      const updName = String(a.name ?? "").trim();
      if (!updName) throw new Error("name is required");
      const desc = a.description !== undefined ? String(a.description).trim() : project.description;
      await updateProject(id, updName, desc);
      return { content: [{ type: "text", text: JSON.stringify({ id, name: updName, description: desc }, null, 2) }] };
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
      const validP = ["low", "medium", "high"];
      const validS = ["todo", "in_progress", "done"];
      const priority = validP.includes(String(a.priority)) ? (String(a.priority) as "low" | "medium" | "high") : "medium";
      const status = validS.includes(String(a.status)) ? (String(a.status) as "todo" | "in_progress" | "done") : "todo";
      const id = await createTask(projectId, title, String(a.description ?? "").trim(), priority, status);
      return { content: [{ type: "text", text: JSON.stringify({ id, title, priority, status }, null, 2) }] };
    }
    case "get_task": {
      const id = Number(a.id);
      const task = await getTask(id);
      if (!task) throw new Error(`Task ${id} not found`);
      const attachments = await listAttachments(id);
      return { content: [{ type: "text", text: JSON.stringify({ ...task, attachments }, null, 2) }] };
    }
    case "update_task": {
      const id = Number(a.id);
      if (!await getTask(id)) throw new Error(`Task ${id} not found`);
      const validP = ["low", "medium", "high"];
      const validS = ["todo", "in_progress", "done"];
      await updateTask(id, {
        ...(a.title !== undefined ? { title: String(a.title).trim() } : {}),
        ...(a.description !== undefined ? { description: String(a.description).trim() } : {}),
        ...(a.priority && validP.includes(String(a.priority)) ? { priority: String(a.priority) as "low" | "medium" | "high" } : {}),
        ...(a.status && validS.includes(String(a.status)) ? { status: String(a.status) as "todo" | "in_progress" | "done" } : {}),
      });
      return { content: [{ type: "text", text: JSON.stringify(await getTask(id), null, 2) }] };
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
      if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
        throw new Error("Invalid filename");
      }
      const bytes = await Deno.readFile(`data/uploads/${filename}`);
      return { content: [{ type: "image", data: bytesToBase64(bytes), mimeType: mimeFromFilename(filename) }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Fresh route handler — lazy MCP SDK import to avoid Vite SSR crash
// ---------------------------------------------------------------------------

async function handleMcp(req: Request): Promise<Response> {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
  const { WebStandardStreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
  );
  const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
    "@modelcontextprotocol/sdk/types.js"
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = new Server(
    { name: "lite-task", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (mcpReq) => {
    const { name, arguments: args } = mcpReq.params;
    const a = (args ?? {}) as Record<string, unknown>;
    try {
      return await handleToolCall(name, a);
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}

export const handler = define.handlers({
  GET: (ctx) => handleMcp(ctx.req),
  POST: (ctx) => handleMcp(ctx.req),
  DELETE: (ctx) => handleMcp(ctx.req),
});

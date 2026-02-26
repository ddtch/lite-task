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
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  getProject,
  getTask,
  listAllTasks,
  listAttachments,
  listProjects,
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
        const projects = listProjects();
        return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
      }

      case "create_project": {
        const pName = String(a.name ?? "").trim();
        if (!pName) throw new Error("name is required");
        const id = createProject(pName, String(a.description ?? "").trim());
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ id, name: pName }, null, 2),
          }],
        };
      }

      case "get_project": {
        const id = Number(a.id);
        const project = getProject(id);
        if (!project) throw new Error(`Project ${id} not found`);
        const tasks = listAllTasks({ projectId: id });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ...project, tasks }, null, 2),
          }],
        };
      }

      case "delete_project": {
        const id = Number(a.id);
        if (!getProject(id)) throw new Error(`Project ${id} not found`);
        deleteProject(id);
        return { content: [{ type: "text", text: `Project ${id} deleted.` }] };
      }

      case "list_tasks": {
        const tasks = listAllTasks({
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

        const id = createTask(
          projectId,
          title,
          String(a.description ?? "").trim(),
          priority,
          status,
        );
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ id, title, priority, status }, null, 2),
          }],
        };
      }

      case "get_task": {
        const id = Number(a.id);
        const task = getTask(id);
        if (!task) throw new Error(`Task ${id} not found`);
        const attachments = listAttachments(id);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ ...task, attachments }, null, 2),
          }],
        };
      }

      case "update_task": {
        const id = Number(a.id);
        if (!getTask(id)) throw new Error(`Task ${id} not found`);
        const validPriorities = ["low", "medium", "high"];
        const validStatuses = ["todo", "in_progress", "done"];
        updateTask(id, {
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
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify(getTask(id), null, 2),
          }],
        };
      }

      case "delete_task": {
        const id = Number(a.id);
        if (!getTask(id)) throw new Error(`Task ${id} not found`);
        deleteTask(id);
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

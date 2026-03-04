/**
 * Retell AI function-calling dispatcher.
 *
 * Retell POSTs here when the LLM invokes a custom tool during a call.
 * Request body: { name: string, args: Record<string, unknown>, call: object }
 * Response: any JSON/string (capped at 15 000 chars by Retell).
 */

import { define } from "../../../utils.ts";
import {
  createReminder,
  createTask,
  listAllTasks,
  listProjects,
  updateTask,
  type Project,
  type Task,
} from "../../../db/queries.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findProjectByName(
  projects: Project[],
  name: string,
): Project | undefined {
  const lower = name.toLowerCase();
  return (
    projects.find((p) => p.name.toLowerCase() === lower) ??
    projects.find((p) => p.name.toLowerCase().includes(lower))
  );
}

function findTaskByTitle(tasks: Task[], title: string): Task | undefined {
  const lower = title.toLowerCase();
  return (
    tasks.find((t) => t.title.toLowerCase() === lower) ??
    tasks.find((t) => t.title.toLowerCase().includes(lower))
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handler = define.handlers({
  async POST(ctx) {
    let body: { name: string; args: Record<string, unknown>; call?: unknown };
    try {
      body = await ctx.req.json();
    } catch {
      return Response.json({ result: "Invalid request" }, { status: 400 });
    }

    const { name, args } = body;

    try {
      let result: string;

      switch (name) {
        case "list_projects": {
          const projects = await listProjects();
          if (projects.length === 0) {
            result = "No projects found. You can ask me to create one.";
          } else {
            const lines = projects.map(
              (p) => `${p.name} (${p.task_count ?? 0} tasks)`,
            );
            result = `You have ${projects.length} project(s): ${lines.join(", ")}.`;
          }
          break;
        }

        case "list_tasks": {
          const projects = await listProjects();
          let projectId: number | undefined;

          if (args.project_name) {
            const proj = findProjectByName(
              projects,
              String(args.project_name),
            );
            if (!proj) {
              result = `Project "${args.project_name}" not found. Available projects: ${projects.map((p) => p.name).join(", ")}.`;
              break;
            }
            projectId = proj.id;
          }

          const tasks = await listAllTasks({
            projectId,
            status: args.status ? String(args.status) : undefined,
            priority: args.priority ? String(args.priority) : undefined,
          });

          if (tasks.length === 0) {
            result = "No tasks found matching your criteria.";
          } else {
            const lines = tasks.slice(0, 10).map(
              (t) =>
                `"${t.title}" (${t.status}, ${t.priority} priority)`,
            );
            result = `Found ${tasks.length} task(s): ${lines.join("; ")}${tasks.length > 10 ? ` ...and ${tasks.length - 10} more` : ""}.`;
          }
          break;
        }

        case "create_task": {
          const title = String(args.title ?? "").trim();
          if (!title) {
            result = "Task title is required.";
            break;
          }

          const projects = await listProjects();
          const proj = findProjectByName(
            projects,
            String(args.project_name ?? ""),
          );
          if (!proj) {
            result = `Project "${args.project_name}" not found. Available projects: ${projects.map((p) => p.name).join(", ")}.`;
            break;
          }

          const validPriorities = ["low", "medium", "high"] as const;
          const priority = validPriorities.includes(
            args.priority as typeof validPriorities[number],
          )
            ? (args.priority as Task["priority"])
            : "medium";

          const id = await createTask(
            proj.id,
            title,
            String(args.description ?? ""),
            priority,
            "todo",
          );
          result = `Task "${title}" created in project "${proj.name}" with ${priority} priority (ID: ${id}).`;
          break;
        }

        case "update_task_status": {
          const taskTitle = String(args.task_title ?? "").trim();
          if (!taskTitle) {
            result = "Task title is required to find the task.";
            break;
          }

          const projects = await listProjects();
          let projectId: number | undefined;
          if (args.project_name) {
            const proj = findProjectByName(
              projects,
              String(args.project_name),
            );
            if (proj) projectId = proj.id;
          }

          const tasks = await listAllTasks({ projectId });
          const task = findTaskByTitle(tasks, taskTitle);
          if (!task) {
            result = `Task "${taskTitle}" not found.`;
            break;
          }

          const validStatuses = ["todo", "in_progress", "done"] as const;
          const status = validStatuses.includes(
            args.status as typeof validStatuses[number],
          )
            ? (args.status as Task["status"])
            : task.status;

          await updateTask(task.id, { status });
          result = `Task "${task.title}" status updated to ${status}.`;
          break;
        }

        case "create_reminder": {
          const message = String(args.message ?? "").trim();
          const remindAt = String(args.remind_at ?? "").trim();
          if (!message || !remindAt) {
            result = "Both message and remind_at are required.";
            break;
          }

          const phoneNumber =
            Deno.env.get("REMINDER_TO_NUMBER") ?? "";
          if (!phoneNumber) {
            result =
              "Reminder phone number not configured. Please set REMINDER_TO_NUMBER.";
            break;
          }

          let taskId: number | null = null;
          if (args.task_title) {
            const tasks = await listAllTasks();
            const task = findTaskByTitle(tasks, String(args.task_title));
            if (task) taskId = task.id;
          }

          const id = await createReminder({
            task_id: taskId,
            message,
            remind_at: remindAt,
            phone_number: phoneNumber,
          });
          result = `Reminder set for ${remindAt}: "${message}" (ID: ${id}).`;
          break;
        }

        case "get_task_summary": {
          const tasks = await listAllTasks();
          const todo = tasks.filter((t) => t.status === "todo").length;
          const inProgress = tasks.filter((t) => t.status === "in_progress")
            .length;
          const done = tasks.filter((t) => t.status === "done").length;
          const highPriority = tasks.filter(
            (t) => t.priority === "high" && t.status !== "done",
          );

          result = `Task summary: ${todo} to do, ${inProgress} in progress, ${done} done (${tasks.length} total).`;
          if (highPriority.length > 0) {
            result += ` High priority: ${highPriority.map((t) => `"${t.title}"`).join(", ")}.`;
          }
          break;
        }

        default:
          result = `Unknown tool: ${name}`;
      }

      return Response.json({ result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[voice/tool] Error in ${name}:`, msg);
      return Response.json({ result: `Error: ${msg}` });
    }
  },
});

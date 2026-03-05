/**
 * Retell AI function-calling dispatcher.
 *
 * Retell POSTs here when the LLM invokes a custom tool during a call.
 * Request body: { name: string, args: Record<string, unknown>, call: object }
 * Response: any JSON/string (capped at 15 000 chars by Retell).
 */

import { define } from "../../../utils.ts";
import {
  createEvent,
  createReminder,
  createTask,
  listAllTasks,
  listEvents,
  listProjects,
  updateEvent,
  updateTask,
  type CalendarEvent,
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

function findEventByTitle(events: CalendarEvent[], title: string): CalendarEvent | undefined {
  const lower = title.toLowerCase();
  return (
    events.find((e) => e.title.toLowerCase() === lower) ??
    events.find((e) => e.title.toLowerCase().includes(lower))
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

          const dueDate = args.due_date ? String(args.due_date).trim() : null;
          const id = await createTask(
            proj.id,
            title,
            String(args.description ?? ""),
            priority,
            "todo",
            dueDate,
          );
          const dueStr = dueDate ? `, due ${dueDate}` : "";
          result = `Task "${title}" created in project "${proj.name}" with ${priority} priority${dueStr} (ID: ${id}).`;
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

        case "list_events": {
          const month = args.month
            ? String(args.month)
            : `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, "0")}`;
          const events = await listEvents({ month });
          if (events.length === 0) {
            result = `No events found for ${month}.`;
          } else {
            const lines = events.slice(0, 10).map((e) => {
              const time = e.event_time ? ` at ${e.event_time}` : "";
              return `"${e.title}" on ${e.event_date}${time} (${e.type})`;
            });
            result = `Found ${events.length} event(s) for ${month}: ${lines.join("; ")}${events.length > 10 ? ` ...and ${events.length - 10} more` : ""}.`;
          }
          break;
        }

        case "create_event": {
          const title = String(args.title ?? "").trim();
          if (!title) { result = "Event title is required."; break; }
          const eventDate = String(args.event_date ?? "").trim();
          if (!eventDate) { result = "Event date is required."; break; }

          const validTypes = ["event", "note", "reminder"] as const;
          const type = validTypes.includes(args.type as typeof validTypes[number])
            ? (args.type as CalendarEvent["type"])
            : "event";

          const id = await createEvent({
            title,
            description: String(args.description ?? "").trim(),
            event_date: eventDate,
            event_time: args.event_time ? String(args.event_time) : null,
            type,
            notify_call: Boolean(args.notify_call),
            remind_before: args.remind_before ? Number(args.remind_before) : undefined,
            remind_interval: args.remind_interval ? String(args.remind_interval) : undefined,
          });

          const timeStr = args.event_time ? ` at ${args.event_time}` : "";
          const callStr = args.notify_call ? " You'll get a phone call 5 minutes before." : "";
          result = `${type.charAt(0).toUpperCase() + type.slice(1)} "${title}" created for ${eventDate}${timeStr} (ID: ${id}).${callStr}`;
          break;
        }

        case "update_event": {
          const eventTitle = String(args.event_title ?? "").trim();
          if (!eventTitle) { result = "Event title is required to find the event."; break; }

          const events = await listEvents();
          const event = findEventByTitle(events, eventTitle);
          if (!event) {
            result = `Event "${eventTitle}" not found.`;
            break;
          }

          const fields: Record<string, unknown> = {};
          if (args.title !== undefined) fields.title = String(args.title).trim();
          if (args.description !== undefined) fields.description = String(args.description).trim();
          if (args.event_date !== undefined) fields.event_date = String(args.event_date);
          if (args.event_time !== undefined) {
            fields.event_time = args.event_time === "none" ? null : String(args.event_time);
          }
          if (args.type !== undefined) {
            const validTypes = ["event", "note", "reminder"];
            if (validTypes.includes(String(args.type))) fields.type = args.type;
          }
          if (args.notify_call !== undefined) fields.notify_call = args.notify_call ? 1 : 0;
          if (args.remind_before !== undefined) fields.remind_before = Number(args.remind_before);
          if (args.remind_interval !== undefined) {
            fields.remind_interval = args.remind_interval === "none" ? null : String(args.remind_interval);
          }

          await updateEvent(event.id, fields);
          result = `Event "${event.title}" updated.`;
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

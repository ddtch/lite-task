/**
 * Voice agent tool definitions for Retell LLM function calling.
 *
 * Tools use project_name/task_title (strings) instead of IDs
 * because voice users say names, not numbers.
 */

import type { RetellTool } from "./retell.ts";

export function buildRetellTools(baseUrl: string): RetellTool[] {
  const url = `${baseUrl}/api/voice/tool`;

  return [
    {
      type: "custom",
      name: "list_projects",
      description:
        "List all projects with task counts. Call when the user asks about their projects.",
      url,
      method: "POST",
      parameters: { type: "object", properties: {} },
      speak_during_execution: true,
      speak_after_execution: true,
      timeout_ms: 10000,
    },
    {
      type: "custom",
      name: "list_tasks",
      description:
        "List tasks, optionally filtered by project name, status, or priority. Call when the user asks about their tasks.",
      url,
      method: "POST",
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
      speak_during_execution: true,
      speak_after_execution: true,
      timeout_ms: 10000,
    },
    {
      type: "custom",
      name: "create_task",
      description:
        "Create a new task. Always confirm the project name and title with the user before calling.",
      url,
      method: "POST",
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
      speak_during_execution: true,
      speak_after_execution: true,
      timeout_ms: 10000,
    },
    {
      type: "custom",
      name: "update_task_status",
      description:
        "Update a task's status. Use when the user says they completed a task, started working on it, etc.",
      url,
      method: "POST",
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
      speak_during_execution: true,
      speak_after_execution: true,
      timeout_ms: 10000,
    },
    {
      type: "custom",
      name: "create_reminder",
      description:
        "Set a reminder. The system will call the user at the specified time. Use when the user says 'remind me about X at Y time'.",
      url,
      method: "POST",
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
      speak_during_execution: true,
      speak_after_execution: true,
      timeout_ms: 10000,
    },
    {
      type: "custom",
      name: "get_task_summary",
      description:
        "Get a summary of all tasks: how many todo, in progress, done, and any high-priority items.",
      url,
      method: "POST",
      parameters: { type: "object", properties: {} },
      speak_during_execution: true,
      speak_after_execution: true,
      timeout_ms: 10000,
    },
    {
      type: "custom",
      name: "list_events",
      description:
        "List calendar events. Call when the user asks about their schedule, upcoming events, or what's on their calendar.",
      url,
      method: "POST",
      parameters: {
        type: "object",
        properties: {
          month: {
            type: "string",
            description: "Month to filter by in YYYY-MM format (e.g. 2026-03). Defaults to current month.",
          },
        },
      },
      speak_during_execution: true,
      speak_after_execution: true,
      timeout_ms: 10000,
    },
    {
      type: "custom",
      name: "create_event",
      description:
        "Create a calendar event, note, or reminder. Timed events get a notification before the event (default 10 min). Set remind_before to choose timing. Set remind_interval for recurring reminders.",
      url,
      method: "POST",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          event_date: { type: "string", description: "Date in YYYY-MM-DD format" },
          event_time: { type: "string", description: "Time in HH:MM format (optional)" },
          description: { type: "string", description: "Optional description" },
          type: {
            type: "string",
            enum: ["event", "note", "reminder"],
            description: "Type of entry, defaults to event",
          },
          notify_call: {
            type: "boolean",
            description: "Set to true to get a phone call reminder 5 minutes before the event",
          },
          remind_before: { type: "number", description: "Minutes before event to notify (5, 10, 30, 60, 1440, 2880). Default: 10" },
          remind_interval: { type: "string", enum: ["hourly", "daily"], description: "Repeat reminders at this interval" },
        },
        required: ["title", "event_date"],
      },
      speak_during_execution: true,
      speak_after_execution: true,
      timeout_ms: 10000,
    },
    {
      type: "custom",
      name: "update_event",
      description:
        "Update a calendar event by title. Use when the user wants to change the time, date, description, or enable/disable call notification for an event.",
      url,
      method: "POST",
      parameters: {
        type: "object",
        properties: {
          event_title: {
            type: "string",
            description: "Title or partial title of the event to update",
          },
          title: { type: "string", description: "New title" },
          event_date: { type: "string", description: "New date in YYYY-MM-DD" },
          event_time: { type: "string", description: "New time in HH:MM, or 'none' to clear" },
          description: { type: "string", description: "New description" },
          type: { type: "string", enum: ["event", "note", "reminder"] },
          notify_call: { type: "boolean", description: "Enable/disable phone call reminder" },
          remind_before: { type: "number", description: "Minutes before event to notify" },
          remind_interval: { type: "string", enum: ["hourly", "daily"], description: "Set recurring interval or 'none' to clear" },
        },
        required: ["event_title"],
      },
      speak_during_execution: true,
      speak_after_execution: true,
      timeout_ms: 10000,
    },
  ];
}

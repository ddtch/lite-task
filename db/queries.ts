import { getDb } from "./database.ts";

// ---------------------------------------------------------------------------
// HTML entity decoding
// ---------------------------------------------------------------------------

function decodeHtml(str: string | null | undefined): string {
  if (!str) return str ?? "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function decodeProject(p: Project): Project {
  return { ...p, name: decodeHtml(p.name), description: decodeHtml(p.description) };
}

function decodeTask(t: Task): Task {
  return { ...t, title: decodeHtml(t.title), description: decodeHtml(t.description) };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  task_count?: number;
  open_task_count?: number;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: number;
  task_id: number;
  type: "image" | "voice" | "audio" | "video";
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  return (await db.all<Project>(`
    SELECT p.*,
           COUNT(t.id) AS task_count,
           COUNT(CASE WHEN t.status != 'done' THEN 1 END) AS open_task_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `)).map(decodeProject);
}

export async function getProject(id: number): Promise<Project | undefined> {
  const db = await getDb();
  const row = await db.get<Project>("SELECT * FROM projects WHERE id = ?", [id]);
  return row ? decodeProject(row) : undefined;
}

export async function createProject(name: string, description: string): Promise<number> {
  const db = await getDb();
  return await db.run(
    "INSERT INTO projects (name, description) VALUES (?, ?)",
    [name, description],
  );
}

export async function updateProject(
  id: number,
  name: string,
  description: string,
): Promise<void> {
  const db = await getDb();
  await db.run(
    "UPDATE projects SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?",
    [name, description, id],
  );
}

export async function deleteProject(id: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM projects WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listTasks(projectId: number): Promise<Task[]> {
  const db = await getDb();
  return (await db.all<Task>(`
    SELECT * FROM tasks
    WHERE project_id = ?
    ORDER BY
      CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      updated_at DESC
  `, [projectId])).map(decodeTask);
}

export async function listAllTasks(opts?: {
  status?: string;
  priority?: string;
  projectId?: number;
}): Promise<Task[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.projectId) {
    conditions.push("project_id = ?");
    params.push(opts.projectId);
  }
  if (opts?.status) {
    conditions.push("status = ?");
    params.push(opts.status);
  }
  if (opts?.priority) {
    conditions.push("priority = ?");
    params.push(opts.priority);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return (await db.all<Task>(
    `SELECT * FROM tasks ${where} ORDER BY updated_at DESC`,
    params,
  )).map(decodeTask);
}

export async function getTask(id: number): Promise<Task | undefined> {
  const db = await getDb();
  const row = await db.get<Task>("SELECT * FROM tasks WHERE id = ?", [id]);
  return row ? decodeTask(row) : undefined;
}

export async function createTask(
  projectId: number,
  title: string,
  description: string,
  priority: Task["priority"],
  status: Task["status"],
): Promise<number> {
  const db = await getDb();
  return await db.run(
    `INSERT INTO tasks (project_id, title, description, priority, status)
     VALUES (?, ?, ?, ?, ?)`,
    [projectId, title, description, priority, status],
  );
}

export async function updateTask(
  id: number,
  fields: Partial<Pick<Task, "title" | "description" | "priority" | "status">>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (fields.title !== undefined) { sets.push("title = ?"); values.push(fields.title); }
  if (fields.description !== undefined) {
    sets.push("description = ?");
    values.push(fields.description);
  }
  if (fields.priority !== undefined) { sets.push("priority = ?"); values.push(fields.priority); }
  if (fields.status !== undefined) { sets.push("status = ?"); values.push(fields.status); }

  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  values.push(id);

  await db.run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, values);
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM tasks WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function listAttachments(taskId: number): Promise<Attachment[]> {
  const db = await getDb();
  return await db.all<Attachment>(
    "SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at DESC",
    [taskId],
  );
}

export async function createAttachment(
  taskId: number,
  type: Attachment["type"],
  filename: string,
  originalName: string,
  mimeType: string,
  size: number,
): Promise<number> {
  const db = await getDb();
  return await db.run(
    `INSERT INTO attachments (task_id, type, filename, original_name, mime_type, size)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [taskId, type, filename, originalName, mimeType, size],
  );
}

export async function deleteAttachment(id: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM attachments WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// Call Logs
// ---------------------------------------------------------------------------

export interface CallLog {
  id: number;
  call_id: string;
  call_type: "phone_call" | "web_call";
  direction: "inbound" | "outbound";
  from_number: string;
  to_number: string;
  duration_seconds: number | null;
  transcript: string | null;
  call_status: string;
  disconnection_reason: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export async function listCallLogs(limit = 50): Promise<CallLog[]> {
  const db = await getDb();
  return await db.all<CallLog>(
    "SELECT * FROM call_logs ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

export async function getCallLog(callId: string): Promise<CallLog | undefined> {
  const db = await getDb();
  return await db.get<CallLog>("SELECT * FROM call_logs WHERE call_id = ?", [callId]);
}

export async function createCallLog(fields: {
  call_id: string;
  call_type: CallLog["call_type"];
  direction: CallLog["direction"];
  from_number?: string;
  to_number?: string;
  call_status?: string;
}): Promise<number> {
  const db = await getDb();
  return await db.run(
    `INSERT INTO call_logs (call_id, call_type, direction, from_number, to_number, call_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      fields.call_id,
      fields.call_type,
      fields.direction,
      fields.from_number ?? "",
      fields.to_number ?? "",
      fields.call_status ?? "registered",
    ],
  );
}

export async function updateCallLog(
  callId: string,
  fields: Partial<Omit<CallLog, "id" | "call_id" | "created_at">>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;
  values.push(callId);
  await db.run(`UPDATE call_logs SET ${sets.join(", ")} WHERE call_id = ?`, values);
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export interface Reminder {
  id: number;
  task_id: number | null;
  project_id: number | null;
  message: string;
  remind_at: string;
  phone_number: string;
  status: "pending" | "triggered" | "completed" | "failed" | "cancelled";
  call_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function listReminders(opts?: { status?: string }): Promise<Reminder[]> {
  const db = await getDb();
  if (opts?.status) {
    return await db.all<Reminder>(
      "SELECT * FROM reminders WHERE status = ? ORDER BY remind_at ASC",
      [opts.status],
    );
  }
  return await db.all<Reminder>("SELECT * FROM reminders ORDER BY remind_at ASC");
}

export async function getReminder(id: number): Promise<Reminder | undefined> {
  const db = await getDb();
  return await db.get<Reminder>("SELECT * FROM reminders WHERE id = ?", [id]);
}

export async function createReminder(fields: {
  task_id?: number | null;
  project_id?: number | null;
  message: string;
  remind_at: string;
  phone_number: string;
}): Promise<number> {
  const db = await getDb();
  return await db.run(
    `INSERT INTO reminders (task_id, project_id, message, remind_at, phone_number)
     VALUES (?, ?, ?, ?, ?)`,
    [
      fields.task_id ?? null,
      fields.project_id ?? null,
      fields.message,
      fields.remind_at,
      fields.phone_number,
    ],
  );
}

export async function updateReminder(
  id: number,
  fields: Partial<Pick<Reminder, "message" | "remind_at" | "phone_number" | "status" | "call_id">>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  values.push(id);
  await db.run(`UPDATE reminders SET ${sets.join(", ")} WHERE id = ?`, values);
}

export async function deleteReminder(id: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM reminders WHERE id = ?", [id]);
}

export async function listDueReminders(): Promise<Reminder[]> {
  const db = await getDb();
  return await db.all<Reminder>(
    "SELECT * FROM reminders WHERE status = 'pending' AND remind_at <= datetime('now')",
  );
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  event_date: string;
  event_time: string | null;
  type: "event" | "note" | "reminder";
  project_id: number | null;
  notify_call: number;
  notified_telegram: number;
  notified_call: number;
  created_at: string;
}

export async function listEvents(opts?: {
  month?: string;
  projectId?: number;
}): Promise<CalendarEvent[]> {
  const db = await getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.month) {
    conditions.push("event_date LIKE ?");
    params.push(`${opts.month}%`);
  }
  if (opts?.projectId) {
    conditions.push("project_id = ?");
    params.push(opts.projectId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return await db.all<CalendarEvent>(
    `SELECT * FROM events ${where} ORDER BY event_date ASC, event_time ASC`,
    params,
  );
}

export async function getEvent(id: number): Promise<CalendarEvent | undefined> {
  const db = await getDb();
  return await db.get<CalendarEvent>("SELECT * FROM events WHERE id = ?", [id]);
}

export async function createEvent(fields: {
  title: string;
  description?: string;
  event_date: string;
  event_time?: string | null;
  type?: CalendarEvent["type"];
  project_id?: number | null;
  notify_call?: boolean;
}): Promise<number> {
  const db = await getDb();
  return await db.run(
    `INSERT INTO events (title, description, event_date, event_time, type, project_id, notify_call)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      fields.title,
      fields.description ?? "",
      fields.event_date,
      fields.event_time ?? null,
      fields.type ?? "event",
      fields.project_id ?? null,
      fields.notify_call ? 1 : 0,
    ],
  );
}

export async function updateEvent(
  id: number,
  fields: Partial<Pick<CalendarEvent, "title" | "description" | "event_date" | "event_time" | "type" | "project_id" | "notify_call">>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (sets.length === 0) return;
  values.push(id);
  await db.run(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`, values);
}

export async function deleteEvent(id: number): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM events WHERE id = ?", [id]);
}

export async function listDueEventsTelegram(): Promise<CalendarEvent[]> {
  const db = await getDb();
  return await db.all<CalendarEvent>(
    `SELECT * FROM events
     WHERE event_time IS NOT NULL
       AND notified_telegram = 0
       AND datetime(event_date || 'T' || event_time) <= datetime('now', 'localtime', '+10 minutes')
       AND datetime(event_date || 'T' || event_time) >= datetime('now', 'localtime')`,
  );
}

export async function listDueEventsCall(): Promise<CalendarEvent[]> {
  const db = await getDb();
  return await db.all<CalendarEvent>(
    `SELECT * FROM events
     WHERE event_time IS NOT NULL
       AND notify_call = 1
       AND notified_call = 0
       AND datetime(event_date || 'T' || event_time) <= datetime('now', 'localtime', '+5 minutes')
       AND datetime(event_date || 'T' || event_time) >= datetime('now', 'localtime')`,
  );
}

export async function markEventNotifiedTelegram(id: number): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE events SET notified_telegram = 1 WHERE id = ?", [id]);
}

export async function markEventNotifiedCall(id: number): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE events SET notified_call = 1 WHERE id = ?", [id]);
}

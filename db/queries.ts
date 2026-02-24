import { getDb } from "./database.ts";

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
  type: "image" | "voice";
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function listProjects(): Project[] {
  const db = getDb();
  return db.prepare(`
    SELECT p.*,
           COUNT(t.id) AS task_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all() as unknown as Project[];
}

export function getProject(id: number): Project | undefined {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM projects WHERE id = ?",
  ).get(id) as unknown as Project | undefined;
}

export function createProject(name: string, description: string): number {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO projects (name, description) VALUES (?, ?)",
  ).run(name, description);
  return Number(result.lastInsertRowid);
}

export function updateProject(id: number, name: string, description: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE projects SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(name, description, id);
}

export function deleteProject(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function listTasks(projectId: number): Task[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM tasks
    WHERE project_id = ?
    ORDER BY
      CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      updated_at DESC
  `).all(projectId) as unknown as Task[];
}

export function listAllTasks(opts?: {
  status?: string;
  priority?: string;
  projectId?: number;
}): Task[] {
  const db = getDb();
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
  return db.prepare(`SELECT * FROM tasks ${where} ORDER BY updated_at DESC`).all(
    ...params,
  ) as unknown as Task[];
}

export function getTask(id: number): Task | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as unknown as Task | undefined;
}

export function createTask(
  projectId: number,
  title: string,
  description: string,
  priority: Task["priority"],
  status: Task["status"],
): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO tasks (project_id, title, description, priority, status)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(projectId, title, description, priority, status);
  return Number(result.lastInsertRowid);
}

export function updateTask(
  id: number,
  fields: Partial<Pick<Task, "title" | "description" | "priority" | "status">>,
): void {
  const db = getDb();
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

  db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteTask(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export function listAttachments(taskId: number): Attachment[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at DESC",
  ).all(taskId) as unknown as Attachment[];
}

export function createAttachment(
  taskId: number,
  type: Attachment["type"],
  filename: string,
  originalName: string,
  mimeType: string,
  size: number,
): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO attachments (task_id, type, filename, original_name, mime_type, size)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(taskId, type, filename, originalName, mimeType, size);
  return Number(result.lastInsertRowid);
}

export function deleteAttachment(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
}

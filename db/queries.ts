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
           COUNT(t.id) AS task_count
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

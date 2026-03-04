import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Adapter interface — common async API for both local SQLite and Turso
// ---------------------------------------------------------------------------

export interface DbAdapter {
  all<T = Record<string, unknown>>(sql: string, args?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, args?: unknown[]): Promise<T | undefined>;
  run(sql: string, args?: unknown[]): Promise<number>;
  exec(sql: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local SQLite adapter (node:sqlite, wrapped in Promise for uniform API)
// ---------------------------------------------------------------------------

class SqliteAdapter implements DbAdapter {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL;");
    this.db.exec("PRAGMA foreign_keys=ON;");
  }

  all<T>(sql: string, args: unknown[] = []): Promise<T[]> {
    // deno-lint-ignore no-explicit-any
    return Promise.resolve(this.db.prepare(sql).all(...args as any[]) as unknown as T[]);
  }

  get<T>(sql: string, args: unknown[] = []): Promise<T | undefined> {
    // deno-lint-ignore no-explicit-any
    return Promise.resolve(this.db.prepare(sql).get(...args as any[]) as unknown as T | undefined);
  }

  run(sql: string, args: unknown[] = []): Promise<number> {
    // deno-lint-ignore no-explicit-any
    const result = this.db.prepare(sql).run(...args as any[]);
    return Promise.resolve(Number(result.lastInsertRowid));
  }

  exec(sql: string): Promise<void> {
    this.db.exec(sql);
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Turso adapter (uses @libsql/client/web over HTTP)
// ---------------------------------------------------------------------------

class TursoAdapter implements DbAdapter {
  // deno-lint-ignore no-explicit-any
  constructor(private client: any) {}

  async all<T>(sql: string, args: unknown[] = []): Promise<T[]> {
    const result = await this.client.execute({ sql, args });
    return result.rows as unknown as T[];
  }

  async get<T>(sql: string, args: unknown[] = []): Promise<T | undefined> {
    const result = await this.client.execute({ sql, args });
    return (result.rows[0] ?? undefined) as unknown as T | undefined;
  }

  async run(sql: string, args: unknown[] = []): Promise<number> {
    const result = await this.client.execute({ sql, args });
    return result.lastInsertRowid ? Number(result.lastInsertRowid) : 0;
  }

  async exec(sql: string): Promise<void> {
    const stmts = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const s of stmts) {
      await this.client.execute(s);
    }
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium'
      CHECK(priority IN ('low', 'medium', 'high')),
    status TEXT NOT NULL DEFAULT 'todo'
      CHECK(status IN ('todo', 'in_progress', 'done')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('image', 'voice', 'audio', 'video')),
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS call_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL UNIQUE,
    call_type TEXT NOT NULL DEFAULT 'phone_call'
      CHECK(call_type IN ('phone_call', 'web_call')),
    direction TEXT NOT NULL DEFAULT 'inbound'
      CHECK(direction IN ('inbound', 'outbound')),
    from_number TEXT NOT NULL DEFAULT '',
    to_number TEXT NOT NULL DEFAULT '',
    duration_seconds INTEGER,
    transcript TEXT,
    call_status TEXT NOT NULL DEFAULT 'registered',
    disconnection_reason TEXT,
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    project_id INTEGER,
    message TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending', 'triggered', 'completed', 'failed', 'cancelled')),
    call_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
  )`;

async function initSchema(db: DbAdapter): Promise<void> {
  await db.exec(SCHEMA);
  const row = await db.get<{ n: number }>("SELECT COUNT(*) as n FROM projects");
  if ((row?.n ?? 0) === 0) {
    await db.run(
      "INSERT INTO projects (name, description) VALUES (?, ?)",
      ["Personal", "My default project"],
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _adapterPromise: Promise<DbAdapter> | null = null;

export function getDb(): Promise<DbAdapter> {
  if (_adapterPromise) return _adapterPromise;

  _adapterPromise = (async (): Promise<DbAdapter> => {
    const tursoUrl = Deno.env.get("TURSO_DB_URL");
    const tursoToken = Deno.env.get("TURSO_API_KEY");

    let adapter: DbAdapter;

    if (tursoUrl && tursoToken) {
      // deno-lint-ignore no-explicit-any
      const { createClient } = await import("@libsql/client/web") as any;
      const client = createClient({ url: tursoUrl, authToken: tursoToken });
      adapter = new TursoAdapter(client);
      console.log(`[db] Using Turso: ${tursoUrl}`);
    } else {
      const dbPath = resolve(Deno.cwd(), "data", "task-light.db");
      adapter = new SqliteAdapter(dbPath);
      console.log(`[db] Using local SQLite: ${dbPath}`);
    }

    await initSchema(adapter);
    return adapter;
  })();

  return _adapterPromise;
}

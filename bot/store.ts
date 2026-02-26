/**
 * Bot message store — persists Telegram messages to SQLite.
 *
 * Separate database file (bot-messages.db) so it doesn't conflict
 * with the web app's task-light.db.
 *
 * Used by:
 *  - bot/main.ts  → saveMessage() on every incoming message
 *  - bot/tools.ts → getMessages() / listChats() as agent tools
 */

import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const DB_PATH = resolve(Deno.cwd(), "data", "bot-messages.db");

let _db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS bot_messages (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id   INTEGER NOT NULL,
        chat_name TEXT    NOT NULL DEFAULT '',
        from_name TEXT    NOT NULL DEFAULT '',
        text      TEXT    NOT NULL,
        date      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_date ON bot_messages (chat_id, date);
    `);
  }
  return _db;
}

export interface StoredMessage {
  from_name: string;
  text: string;
  date: number;
}

export interface ChatSummary {
  chat_id: number;
  chat_name: string;
  message_count: number;
  last_date: number;
}

export function saveMessage(
  chatId: number,
  chatName: string,
  fromName: string,
  text: string,
  date: number,
): void {
  getDb()
    .prepare(
      "INSERT INTO bot_messages (chat_id, chat_name, from_name, text, date) VALUES (?, ?, ?, ?, ?)",
    )
    .run(chatId, chatName, fromName, text, date);
}

/** Returns messages in chronological order (oldest first). */
export function getMessages(chatId: number, limit: number): StoredMessage[] {
  return (
    getDb()
      .prepare(
        `SELECT from_name, text, date
         FROM bot_messages
         WHERE chat_id = ?
         ORDER BY date DESC
         LIMIT ?`,
      )
      .all(chatId, limit)
      .reverse()
  ) as unknown as StoredMessage[];
}

/** Returns one row per unique chat, sorted by most recent activity. */
export function listChats(): ChatSummary[] {
  return getDb()
    .prepare(
      `SELECT chat_id, chat_name, COUNT(*) AS message_count, MAX(date) AS last_date
       FROM bot_messages
       GROUP BY chat_id
       ORDER BY last_date DESC`,
    )
    .all() as unknown as ChatSummary[];
}

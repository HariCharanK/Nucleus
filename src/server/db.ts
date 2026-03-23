import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

let db: Database | null = null;
let dbPath: string | null = null;

/**
 * Get (or create) the SQLite database instance.
 * Stored at NOTES_DIR/.nucleus/nucleus.db so it travels with the notes repo.
 */
export async function getDb(notesDir: string): Promise<Database> {
  if (db) return db;

  const nucleusDir = resolve(notesDir, '.nucleus');
  mkdirSync(nucleusDir, { recursive: true });
  dbPath = resolve(nucleusDir, 'nucleus.db');

  const SQL = await initSqlJs();

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Untitled',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      parts TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_messages_session
      ON messages(session_id, id)
  `);

  return db;
}

/** Persist the in-memory database to disk. */
function persist(): void {
  if (!db || !dbPath) return;
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

export interface SessionRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string;
  parts: string | null;
  created_at: string;
}

/** Create a new session, return its row. */
export async function createSession(
  notesDir: string,
  title?: string,
): Promise<SessionRow> {
  const d = await getDb(notesDir);
  const id = randomUUID();
  d.run('INSERT INTO sessions (id, title) VALUES (?, ?)', [
    id,
    title ?? 'Untitled',
  ]);
  persist();

  const rows = d.exec('SELECT * FROM sessions WHERE id = ?', [id]);
  const r = rows[0].values[0];
  return {
    id: r[0] as string,
    title: r[1] as string,
    created_at: r[2] as string,
    updated_at: r[3] as string,
  };
}

/** List sessions, most recent first. */
export async function listSessions(notesDir: string): Promise<SessionRow[]> {
  const d = await getDb(notesDir);
  const rows = d.exec('SELECT * FROM sessions ORDER BY updated_at DESC');
  if (rows.length === 0) return [];
  return rows[0].values.map((r) => ({
    id: r[0] as string,
    title: r[1] as string,
    created_at: r[2] as string,
    updated_at: r[3] as string,
  }));
}

/** Get a single session by ID. */
export async function getSession(
  notesDir: string,
  id: string,
): Promise<SessionRow | null> {
  const d = await getDb(notesDir);
  const rows = d.exec('SELECT * FROM sessions WHERE id = ?', [id]);
  if (rows.length === 0 || rows[0].values.length === 0) return null;
  const r = rows[0].values[0];
  return {
    id: r[0] as string,
    title: r[1] as string,
    created_at: r[2] as string,
    updated_at: r[3] as string,
  };
}

/** Update session title and/or updated_at. */
export async function updateSession(
  notesDir: string,
  id: string,
  updates: { title?: string },
): Promise<void> {
  const d = await getDb(notesDir);
  if (updates.title !== undefined) {
    d.run(
      "UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?",
      [updates.title, id],
    );
  } else {
    d.run(
      "UPDATE sessions SET updated_at = datetime('now') WHERE id = ?",
      [id],
    );
  }
  persist();
}

/** Delete a session and its messages. */
export async function deleteSession(
  notesDir: string,
  id: string,
): Promise<void> {
  const d = await getDb(notesDir);
  d.run('DELETE FROM messages WHERE session_id = ?', [id]);
  d.run('DELETE FROM sessions WHERE id = ?', [id]);
  persist();
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Append a message to a session. */
export async function addMessage(
  notesDir: string,
  sessionId: string,
  message: { role: string; content: string; parts?: unknown[] },
): Promise<void> {
  const d = await getDb(notesDir);
  d.run(
    'INSERT INTO messages (session_id, role, content, parts) VALUES (?, ?, ?, ?)',
    [
      sessionId,
      message.role,
      message.content,
      message.parts ? JSON.stringify(message.parts) : null,
    ],
  );
  d.run("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?", [
    sessionId,
  ]);
  persist();
}

/** Get all messages for a session, in order. */
export async function getMessages(
  notesDir: string,
  sessionId: string,
): Promise<MessageRow[]> {
  const d = await getDb(notesDir);
  const rows = d.exec(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC',
    [sessionId],
  );
  if (rows.length === 0) return [];
  return rows[0].values.map((r) => ({
    id: r[0] as number,
    session_id: r[1] as string,
    role: r[2] as string,
    content: r[3] as string,
    parts: r[4] as string | null,
    created_at: r[5] as string,
  }));
}

/** Replace all messages for a session (used by useChat bulk save). */
export async function replaceMessages(
  notesDir: string,
  sessionId: string,
  messages: { role: string; content: string; parts?: unknown[] }[],
): Promise<void> {
  const d = await getDb(notesDir);
  d.run('DELETE FROM messages WHERE session_id = ?', [sessionId]);

  for (const msg of messages) {
    d.run(
      'INSERT INTO messages (session_id, role, content, parts) VALUES (?, ?, ?, ?)',
      [
        sessionId,
        msg.role,
        msg.content,
        msg.parts ? JSON.stringify(msg.parts) : null,
      ],
    );
  }

  d.run("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?", [
    sessionId,
  ]);
  persist();
}

/** Generate a short title from the first user message. */
export function titleFromMessage(content: string): string {
  const cleaned = content.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 50) return cleaned;
  return cleaned.slice(0, 47) + '…';
}

/** Reset the DB singleton (for testing). */
export function resetDb(): void {
  if (db) {
    db.close();
    db = null;
    dbPath = null;
  }
}

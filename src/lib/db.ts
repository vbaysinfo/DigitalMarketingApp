import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// Embedded SQLite (Node's built-in driver). Data lives in DATA_DIR, which must
// be a persistent volume in production.

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? path.join(process.cwd(), "data"));
export const MEDIA_DIR = path.join(DATA_DIR, "media");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  group_id TEXT,
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'English',
  status TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  hook TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '[]',
  keywords TEXT NOT NULL DEFAULT '[]',
  link TEXT NOT NULL DEFAULT '',
  image_prompt TEXT NOT NULL DEFAULT '',
  image_concept TEXT NOT NULL DEFAULT '',
  media_ids TEXT NOT NULL DEFAULT '[]',
  carousel TEXT NOT NULL DEFAULT '[]',
  video TEXT,
  quality TEXT NOT NULL DEFAULT '[]',
  account_id TEXT,
  destination_id TEXT,
  scheduled_at TEXT,
  timezone TEXT,
  approved_at TEXT,
  approved_hash TEXT,
  duplicate_override INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  platform_post_id TEXT,
  published_url TEXT,
  last_error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  generator TEXT NOT NULL DEFAULT 'ai',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_status ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_content_sched ON content_items(status, scheduled_at);

CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_name TEXT NOT NULL,
  external_id TEXT NOT NULL,
  destinations TEXT NOT NULL DEFAULT '[]',
  secrets_enc TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  expires_at TEXT,
  connected_at TEXT NOT NULL,
  last_tested_at TEXT,
  last_error TEXT,
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  code_verifier TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  file TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_sec REAL,
  source TEXT NOT NULL DEFAULT 'upload',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_log (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL,
  post_id TEXT,
  url TEXT,
  error TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_log_content ON publish_log(content_id);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metrics_content ON metrics(content_id, fetched_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  content_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

type G = typeof globalThis & { __smDb?: DatabaseSync };

export function db(): DatabaseSync {
  const g = globalThis as G;
  if (!g.__smDb) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const d = new DatabaseSync(path.join(DATA_DIR, "app.db"));
    d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    d.exec(SCHEMA);
    g.__smDb = d;
  }
  return g.__smDb;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function kvGet<T>(key: string, fallback: T): T {
  const row = db().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? parseJson<T>(row.value, fallback) : fallback;
}

export function kvSet(key: string, value: unknown): void {
  db()
    .prepare("INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

import "server-only";
import { db, kvGet, kvSet, newId, nowIso, parseJson } from "../db";
import type { AppSettings, BusinessProfile, NotificationItem, Platform } from "../types";

// ---------- Business profile / brand memory ----------

export const EMPTY_PROFILE: BusinessProfile = {
  businessName: "",
  description: "",
  industry: "",
  products: "",
  services: "",
  targetAudience: "",
  location: "",
  website: "",
  contact: "",
  whatsapp: "",
  logoMediaId: "",
  brandColors: ["#4f46e5", "#0f172a", "#f8fafc"],
  brandFonts: "",
  brandStyle: "",
  preferredLanguage: "English",
  preferredTone: "Professional",
  brandVoice: "Professional",
  customRules: "",
  preferredPlatforms: ["linkedin", "instagram", "facebook"],
  postingFrequency: "1 post per day",
};

export function getProfile(): BusinessProfile {
  return { ...EMPTY_PROFILE, ...kvGet<Partial<BusinessProfile>>("profile", {}) };
}

export function saveProfile(p: BusinessProfile): void {
  kvSet("profile", p);
}

export const DEFAULT_SETTINGS: AppSettings = {
  publishingMode: "manual",
  timezone: "Asia/Kolkata",
  postingTimes: ["10:00", "18:00"],
  maxPostsPerDayPerPlatform: 1,
  duplicateWindowDays: 90,
};

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...kvGet<Partial<AppSettings>>("settings", {}) };
}

export function saveSettings(s: AppSettings): void {
  kvSet("settings", s);
}

/** Returns true at most once per UTC day for the given key (simple daily job gate). */
export function kvGetDaily(key: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (kvGet<string>(`daily:${key}`, "") === today) return false;
  kvSet(`daily:${key}`, today);
  return true;
}

// ---------- Notifications ----------

export function notify(type: string, title: string, body: string, link: string | null = null): void {
  db()
    .prepare("INSERT INTO notifications (id, type, title, body, link, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)")
    .run(newId("ntf"), type, title, body.slice(0, 1000), link, nowIso());
}

export function listNotifications(limit = 100): NotificationItem[] {
  return (
    db().prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[]
  ).map((r) => ({
    id: r.id as string,
    type: r.type as string,
    title: r.title as string,
    body: r.body as string,
    link: (r.link as string) ?? null,
    read: Boolean(r.read),
    createdAt: r.created_at as string,
  }));
}

export function unreadCount(): number {
  const r = db().prepare("SELECT COUNT(*) AS n FROM notifications WHERE read = 0").get() as { n: number };
  return Number(r.n);
}

export function markAllRead(): void {
  db().prepare("UPDATE notifications SET read = 1").run();
}

// ---------- Publishing log (audit trail) ----------

export type LogEntry = {
  id: string;
  contentId: string;
  platform: Platform;
  event: string;
  status: string;
  postId: string | null;
  url: string | null;
  error: string | null;
  detail: string | null;
  createdAt: string;
};

export function logPublish(e: Omit<LogEntry, "id" | "createdAt">): void {
  db()
    .prepare(
      `INSERT INTO publish_log (id, content_id, platform, event, status, post_id, url, error, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(newId("log"), e.contentId, e.platform, e.event, e.status, e.postId, e.url, e.error, e.detail, nowIso());
}

export function listLog(f: { contentId?: string; limit?: number } = {}): LogEntry[] {
  const rows = (
    f.contentId
      ? db().prepare("SELECT * FROM publish_log WHERE content_id = ? ORDER BY created_at DESC").all(f.contentId)
      : db().prepare("SELECT * FROM publish_log ORDER BY created_at DESC LIMIT ?").all(f.limit ?? 300)
  ) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    contentId: r.content_id as string,
    platform: r.platform as Platform,
    event: r.event as string,
    status: r.status as string,
    postId: (r.post_id as string) ?? null,
    url: (r.url as string) ?? null,
    error: (r.error as string) ?? null,
    detail: (r.detail as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

// ---------- Metrics (only real data fetched from platform APIs) ----------

export type MetricSnapshot = { contentId: string; platform: Platform; fetchedAt: string; data: Record<string, number> };

export function saveMetrics(contentId: string, platform: Platform, data: Record<string, number>): void {
  db()
    .prepare("INSERT INTO metrics (id, content_id, platform, fetched_at, data) VALUES (?, ?, ?, ?, ?)")
    .run(newId("met"), contentId, platform, nowIso(), JSON.stringify(data));
}

/** Latest snapshot per content item. */
export function latestMetrics(): MetricSnapshot[] {
  const rows = db()
    .prepare(
      `SELECT m.* FROM metrics m JOIN (SELECT content_id, MAX(fetched_at) AS f FROM metrics GROUP BY content_id) x
       ON x.content_id = m.content_id AND x.f = m.fetched_at`,
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    contentId: r.content_id as string,
    platform: r.platform as Platform,
    fetchedAt: r.fetched_at as string,
    data: parseJson(r.data, {}),
  }));
}

export function metricsHistory(): MetricSnapshot[] {
  return (db().prepare("SELECT * FROM metrics ORDER BY fetched_at").all() as Record<string, unknown>[]).map((r) => ({
    contentId: r.content_id as string,
    platform: r.platform as Platform,
    fetchedAt: r.fetched_at as string,
    data: parseJson(r.data, {}),
  }));
}

// ---------- Chat ----------

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; contentIds: string[]; createdAt: string };

export function addChat(role: ChatMessage["role"], content: string, contentIds: string[] = []): ChatMessage {
  const m = { id: newId("msg"), role, content, contentIds, createdAt: nowIso() };
  db()
    .prepare("INSERT INTO chat_messages (id, role, content, content_ids, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(m.id, role, content, JSON.stringify(contentIds), m.createdAt);
  return m;
}

export function listChat(limit = 200): ChatMessage[] {
  const rows = db()
    .prepare("SELECT * FROM (SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC")
    .all(limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    role: r.role as ChatMessage["role"],
    content: r.content as string,
    contentIds: parseJson(r.content_ids, []),
    createdAt: r.created_at as string,
  }));
}

export function clearChat(): void {
  db().prepare("DELETE FROM chat_messages").run();
}

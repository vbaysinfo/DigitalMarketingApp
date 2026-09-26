import "server-only";
import { db, newId, nowIso, parseJson } from "../db";
import { sha256 } from "../crypto";
import { canTransition } from "../status";
import type { ContentItem, ContentStatus, Platform } from "../types";

type Row = Record<string, unknown>;

function toItem(r: Row): ContentItem {
  return {
    id: r.id as string,
    groupId: (r.group_id as string) ?? null,
    platform: r.platform as Platform,
    contentType: r.content_type as ContentItem["contentType"],
    category: r.category as string,
    topic: r.topic as string,
    language: r.language as string,
    status: r.status as ContentStatus,
    title: r.title as string,
    hook: r.hook as string,
    body: r.body as string,
    cta: r.cta as string,
    hashtags: parseJson(r.hashtags, []),
    keywords: parseJson(r.keywords, []),
    link: r.link as string,
    imagePrompt: r.image_prompt as string,
    imageConcept: r.image_concept as string,
    mediaIds: parseJson(r.media_ids, []),
    carousel: parseJson(r.carousel, []),
    video: parseJson(r.video, null),
    quality: parseJson(r.quality, []),
    accountId: (r.account_id as string) ?? null,
    destinationId: (r.destination_id as string) ?? null,
    scheduledAt: (r.scheduled_at as string) ?? null,
    timezone: (r.timezone as string) ?? null,
    approvedAt: (r.approved_at as string) ?? null,
    approvedHash: (r.approved_hash as string) ?? null,
    duplicateOverride: Boolean(r.duplicate_override),
    publishedAt: (r.published_at as string) ?? null,
    platformPostId: (r.platform_post_id as string) ?? null,
    publishedUrl: (r.published_url as string) ?? null,
    lastError: (r.last_error as string) ?? null,
    attempts: Number(r.attempts ?? 0),
    generator: (r.generator as ContentItem["generator"]) ?? "ai",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** Fingerprint of everything that gets published. Approval is bound to it. */
export function contentHash(c: Pick<
  ContentItem,
  "platform" | "contentType" | "title" | "hook" | "body" | "cta" | "hashtags" | "link" | "mediaIds" | "carousel" | "video" | "destinationId" | "accountId"
>): string {
  return sha256(
    JSON.stringify([
      c.platform,
      c.contentType,
      c.title,
      c.hook,
      c.body,
      c.cta,
      c.hashtags,
      c.link,
      c.mediaIds,
      c.carousel,
      c.video,
      c.accountId,
      c.destinationId,
    ]),
  );
}

export type NewContent = Partial<ContentItem> & Pick<ContentItem, "platform" | "contentType">;

const COLS: Record<string, string> = {
  groupId: "group_id",
  platform: "platform",
  contentType: "content_type",
  category: "category",
  topic: "topic",
  language: "language",
  status: "status",
  title: "title",
  hook: "hook",
  body: "body",
  cta: "cta",
  hashtags: "hashtags",
  keywords: "keywords",
  link: "link",
  imagePrompt: "image_prompt",
  imageConcept: "image_concept",
  mediaIds: "media_ids",
  carousel: "carousel",
  video: "video",
  quality: "quality",
  accountId: "account_id",
  destinationId: "destination_id",
  scheduledAt: "scheduled_at",
  timezone: "timezone",
  approvedAt: "approved_at",
  approvedHash: "approved_hash",
  duplicateOverride: "duplicate_override",
  publishedAt: "published_at",
  platformPostId: "platform_post_id",
  publishedUrl: "published_url",
  lastError: "last_error",
  attempts: "attempts",
  generator: "generator",
};
const JSON_FIELDS = new Set(["hashtags", "keywords", "mediaIds", "carousel", "video", "quality"]);

function encode(key: string, v: unknown): string | number | null {
  if (JSON_FIELDS.has(key)) return v === null || v === undefined ? (key === "video" ? null : "[]") : JSON.stringify(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === undefined) return null;
  return v as string | number | null;
}

export function createContent(input: NewContent): ContentItem {
  const id = newId("cnt");
  const ts = nowIso();
  const data: Record<string, unknown> = { status: "DRAFT", generator: "ai", ...input };
  const keys = Object.keys(data).filter((k) => COLS[k]);
  const sql = `INSERT INTO content_items (id, created_at, updated_at, ${keys.map((k) => COLS[k]).join(", ")})
    VALUES (?, ?, ?, ${keys.map(() => "?").join(", ")})`;
  db()
    .prepare(sql)
    .run(id, ts, ts, ...keys.map((k) => encode(k, data[k])));
  return getContent(id)!;
}

export function getContent(id: string): ContentItem | null {
  const r = db().prepare("SELECT * FROM content_items WHERE id = ?").get(id) as Row | undefined;
  return r ? toItem(r) : null;
}

export type ContentFilter = {
  status?: ContentStatus[];
  platform?: Platform;
  from?: string;
  to?: string;
  q?: string;
  groupId?: string;
  limit?: number;
};

export function listContent(f: ContentFilter = {}): ContentItem[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.status?.length) {
    where.push(`status IN (${f.status.map(() => "?").join(",")})`);
    args.push(...f.status);
  }
  if (f.platform) {
    where.push("platform = ?");
    args.push(f.platform);
  }
  if (f.groupId) {
    where.push("group_id = ?");
    args.push(f.groupId);
  }
  if (f.from) {
    where.push("COALESCE(scheduled_at, published_at, created_at) >= ?");
    args.push(f.from);
  }
  if (f.to) {
    where.push("COALESCE(scheduled_at, published_at, created_at) < ?");
    args.push(f.to);
  }
  if (f.q) {
    where.push("(title LIKE ? OR body LIKE ? OR topic LIKE ?)");
    const like = `%${f.q}%`;
    args.push(like, like, like);
  }
  const sql = `SELECT * FROM content_items ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ?`;
  args.push(f.limit ?? 500);
  return (db().prepare(sql).all(...args) as Row[]).map(toItem);
}

/** Low-level field update. Callers go through the service functions below. */
function patch(id: string, fields: Partial<ContentItem>): void {
  const keys = Object.keys(fields).filter((k) => COLS[k]);
  if (!keys.length) return;
  const sql = `UPDATE content_items SET ${keys.map((k) => `${COLS[k]} = ?`).join(", ")}, updated_at = ? WHERE id = ?`;
  db()
    .prepare(sql)
    .run(...keys.map((k) => encode(k, (fields as Record<string, unknown>)[k])), nowIso(), id);
}

export class TransitionError extends Error {}

export function setStatus(id: string, to: ContentStatus, extra: Partial<ContentItem> = {}): ContentItem {
  const c = getContent(id);
  if (!c) throw new TransitionError("Content not found");
  if (!canTransition(c.status, to)) {
    throw new TransitionError(`Cannot move content from ${c.status} to ${to}.`);
  }
  patch(id, { ...extra, status: to });
  return getContent(id)!;
}

/**
 * Atomically claim an item for publishing (compare-and-set on status) so two
 * workers can never publish the same item twice.
 */
export function claimForPublishing(id: string, fromStatuses: ContentStatus[]): boolean {
  const res = db()
    .prepare(
      `UPDATE content_items SET status = 'PUBLISHING', attempts = attempts + 1, updated_at = ?
       WHERE id = ? AND status IN (${fromStatuses.map(() => "?").join(",")})`,
    )
    .run(nowIso(), id, ...fromStatuses);
  return Number(res.changes) === 1;
}

export const EDITABLE_FIELDS = [
  "title",
  "hook",
  "body",
  "cta",
  "hashtags",
  "keywords",
  "link",
  "imagePrompt",
  "imageConcept",
  "mediaIds",
  "carousel",
  "video",
  "quality",
  "accountId",
  "destinationId",
  "topic",
  "category",
  "language",
  "contentType",
  "generator",
] as const;

/**
 * Edit content. If the published payload changes after approval, the approval
 * is revoked and the item goes back to WAITING_FOR_APPROVAL (a scheduled post
 * returns to the calendar as a planned slot). This makes "approve then silently change" impossible.
 */
export function editContent(id: string, fields: Partial<ContentItem>): ContentItem {
  const c = getContent(id);
  if (!c) throw new TransitionError("Content not found");
  if (["PUBLISHING", "PUBLISHED", "CANCELLED", "GENERATING"].includes(c.status)) {
    throw new TransitionError(`Content in status ${c.status} cannot be edited.`);
  }
  const clean: Partial<ContentItem> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in fields) (clean as Record<string, unknown>)[k] = (fields as Record<string, unknown>)[k];
  }
  const next = { ...c, ...clean };
  const changed = contentHash(next) !== contentHash(c);
  if (changed && ["APPROVED", "SCHEDULED", "PUBLISH_FAILED"].includes(c.status)) {
    patch(id, {
      ...clean,
      status: "WAITING_FOR_APPROVAL",
      approvedAt: null,
      approvedHash: null,
      duplicateOverride: false,
    });
  } else {
    patch(id, clean);
  }
  return getContent(id)!;
}

export function markApproved(id: string): ContentItem {
  const c = getContent(id);
  if (!c) throw new TransitionError("Content not found");
  if (!["DRAFT", "WAITING_FOR_APPROVAL", "APPROVED", "PUBLISH_FAILED"].includes(c.status)) {
    throw new TransitionError(`Content in status ${c.status} cannot be approved.`);
  }
  return setStatus(id, "APPROVED", { approvedAt: nowIso(), approvedHash: contentHash(c), lastError: null });
}

export function recordPublishResult(
  id: string,
  result: { ok: true; postId: string; url: string | null } | { ok: false; error: string },
): ContentItem {
  if (result.ok) {
    return setStatus(id, "PUBLISHED", {
      platformPostId: result.postId,
      publishedUrl: result.url,
      publishedAt: nowIso(),
      lastError: null,
    });
  }
  return setStatus(id, "PUBLISH_FAILED", { lastError: result.error });
}

export function setField(id: string, fields: Partial<ContentItem>): void {
  patch(id, fields);
}

export function deleteContent(id: string): void {
  db().prepare("DELETE FROM content_items WHERE id = ? AND status NOT IN ('PUBLISHING')").run(id);
}

export function statusCounts(): Record<string, number> {
  const rows = db().prepare("SELECT status, COUNT(*) AS n FROM content_items GROUP BY status").all() as {
    status: string;
    n: number;
  }[];
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}

export function recentTopics(limit = 60): string[] {
  const rows = db()
    .prepare("SELECT DISTINCT topic FROM content_items WHERE topic != '' ORDER BY created_at DESC LIMIT ?")
    .all(limit) as { topic: string }[];
  return rows.map((r) => r.topic);
}

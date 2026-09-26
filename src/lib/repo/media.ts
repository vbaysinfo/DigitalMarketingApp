import "server-only";
import fs from "node:fs";
import path from "node:path";
import { db, MEDIA_DIR, newId, nowIso } from "../db";
import { sha256 } from "../crypto";
import type { MediaAsset } from "../types";

type Row = Record<string, unknown>;

const toAsset = (r: Row): MediaAsset => ({
  id: r.id as string,
  name: r.name as string,
  category: r.category as string,
  mime: r.mime as string,
  size: Number(r.size),
  width: (r.width as number) ?? null,
  height: (r.height as number) ?? null,
  durationSec: (r.duration_sec as number) ?? null,
  source: (r.source as MediaAsset["source"]) ?? "upload",
  createdAt: r.created_at as string,
});

export const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
]);

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

export function saveMedia(input: {
  name: string;
  category: string;
  mime: string;
  data: Buffer;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  source?: MediaAsset["source"];
}): MediaAsset {
  if (!ALLOWED_MIME.has(input.mime)) throw new Error(`Unsupported file type: ${input.mime}`);
  const id = newId("med");
  const file = `${id}.${EXT[input.mime]}`;
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ MEDIA_DIR, file), input.data);
  db()
    .prepare(
      `INSERT INTO media (id, name, category, mime, size, file, sha256, width, height, duration_sec, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name.slice(0, 200),
      input.category,
      input.mime,
      input.data.length,
      file,
      sha256(input.data),
      input.width ?? null,
      input.height ?? null,
      input.durationSec ?? null,
      input.source ?? "upload",
      nowIso(),
    );
  return getMedia(id)!;
}

export function getMedia(id: string): MediaAsset | null {
  const r = db().prepare("SELECT * FROM media WHERE id = ?").get(id) as Row | undefined;
  return r ? toAsset(r) : null;
}

export function mediaHash(id: string): string | null {
  const r = db().prepare("SELECT sha256 FROM media WHERE id = ?").get(id) as { sha256: string } | undefined;
  return r?.sha256 ?? null;
}

export function mediaPath(id: string): string | null {
  const r = db().prepare("SELECT file FROM media WHERE id = ?").get(id) as { file: string } | undefined;
  if (!r) return null;
  const p = path.join(MEDIA_DIR, path.basename(r.file));
  return fs.existsSync(p) ? p : null;
}

export function readMedia(id: string): { asset: MediaAsset; data: Buffer } {
  const asset = getMedia(id);
  const p = mediaPath(id);
  if (!asset || !p) throw new Error(`Media ${id} is missing.`);
  return { asset, data: fs.readFileSync(/*turbopackIgnore: true*/ p) };
}

export function listMedia(f: { category?: string; q?: string } = {}): MediaAsset[] {
  const where: string[] = [];
  const args: string[] = [];
  if (f.category) {
    where.push("category = ?");
    args.push(f.category);
  }
  if (f.q) {
    where.push("name LIKE ?");
    args.push(`%${f.q}%`);
  }
  return (
    db()
      .prepare(`SELECT * FROM media ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC`)
      .all(...args) as Row[]
  ).map(toAsset);
}

export function renameMedia(id: string, name: string, category?: string): void {
  if (category) db().prepare("UPDATE media SET name = ?, category = ? WHERE id = ?").run(name.slice(0, 200), category, id);
  else db().prepare("UPDATE media SET name = ? WHERE id = ?").run(name.slice(0, 200), id);
}

export function deleteMedia(id: string): void {
  const p = mediaPath(id);
  db().prepare("DELETE FROM media WHERE id = ?").run(id);
  if (p) fs.rmSync(p, { force: true });
}

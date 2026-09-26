import "server-only";
import { listContent } from "../repo/content";
import { mediaHash } from "../repo/media";
import { getSettings } from "../repo/misc";
import { composeCaption, normaliseTopic, similarity } from "../platform-rules";
import type { ContentItem } from "../types";

// Duplicate Content Protection: compares against recently published or queued
// content on the same platform (caption, image/video, topic).

export type DuplicateMatch = { id: string; reason: string; score: number; title: string };

export function findDuplicates(item: ContentItem): DuplicateMatch[] {
  const days = getSettings().duplicateWindowDays;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const others = listContent({ platform: item.platform, status: ["PUBLISHED", "SCHEDULED", "APPROVED", "PUBLISHING"], limit: 1000 }).filter(
    (c) => c.id !== item.id && (c.publishedAt ?? c.scheduledAt ?? c.updatedAt) >= since,
  );
  const caption = composeCaption(item);
  const myMedia = new Set(item.mediaIds.map(mediaHash).filter(Boolean));
  const topic = normaliseTopic(item.topic);
  const out: DuplicateMatch[] = [];
  for (const o of others) {
    const s = similarity(caption, composeCaption(o));
    if (s >= 0.6) {
      out.push({ id: o.id, reason: `Caption ${Math.round(s * 100)}% similar`, score: s, title: o.title || o.hook });
      continue;
    }
    const shared = o.mediaIds.map(mediaHash).filter((h) => h && myMedia.has(h));
    if (shared.length) {
      out.push({ id: o.id, reason: "Same image/video already used", score: 0.9, title: o.title || o.hook });
      continue;
    }
    if (topic && normaliseTopic(o.topic) === topic && o.status === "PUBLISHED") {
      out.push({ id: o.id, reason: "Same topic recently published", score: 0.5, title: o.title || o.hook });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

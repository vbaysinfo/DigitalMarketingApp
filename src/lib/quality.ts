import "server-only";
import { PLATFORM_RULES, composeCaption } from "./platform-rules";
import { getMedia } from "./repo/media";
import { findDuplicates } from "./publishing/duplicates";
import { getProfile } from "./repo/misc";
import type { ContentItem, QualityIssue } from "./types";

// Quality Check Agent: deterministic checks + the AI's self-review notes.
// "error" issues block approval until fixed or acknowledged; warnings are shown.

async function linkOk(url: string): Promise<boolean> {
  try {
    const ctrl = AbortSignal.timeout(6000);
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl });
    if (r.status === 405 || r.status === 403) r = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(6000) });
    return r.status < 400;
  } catch {
    return false;
  }
}

const CLAIM_WORDS = /\b(guarantee[ds]?|100%|best in (the )?(world|india|city)|no\.?\s?1|number one|#1|cheapest|lowest price|award[- ]winning|certified|clinically|proven)\b/i;

export async function qualityCheck(item: ContentItem, aiNotes: string[] = [], opts: { checkLinks?: boolean } = {}): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];
  const r = PLATFORM_RULES[item.platform];
  const caption = composeCaption(item);

  if (!caption.trim()) issues.push({ level: "error", code: "empty", message: "Caption is empty." });
  if (caption.length > r.maxChars)
    issues.push({ level: "error", code: "too_long", message: `Caption is ${caption.length} characters; ${item.platform} allows ${r.maxChars}.` });
  if (r.titleMax && item.title.length > r.titleMax)
    issues.push({ level: "error", code: "title_long", message: `Title is ${item.title.length} characters; max ${r.titleMax}.` });
  if (item.hashtags.length > r.maxHashtags)
    issues.push({ level: "warning", code: "hashtags_many", message: `${item.hashtags.length} hashtags; recommended max is ${r.maxHashtags}.` });
  if (item.hashtags.length < r.idealHashtags[0])
    issues.push({ level: "info", code: "hashtags_few", message: `Consider ${r.idealHashtags[0]}–${r.idealHashtags[1]} relevant hashtags.` });
  if (!r.supportedTypes.includes(item.contentType))
    issues.push({ level: "error", code: "format", message: `${item.contentType} is not supported on ${item.platform}.` });

  // Media checks
  const media = item.mediaIds.map(getMedia).filter((m) => m !== null);
  if (item.mediaIds.length !== media.length) issues.push({ level: "error", code: "media_missing", message: "Some attached media files are missing." });
  const hasVideo = media.some((m) => m.mime.startsWith("video/"));
  const hasImage = media.some((m) => m.mime.startsWith("image/"));
  if (r.requiresVideo && !hasVideo) issues.push({ level: "error", code: "needs_video", message: `${item.platform} requires a video. Render or attach one.` });
  else if (r.requiresMedia && !media.length) issues.push({ level: "error", code: "needs_media", message: `${item.platform} requires an image or video.` });
  if (["reel", "short", "video"].includes(item.contentType) && !hasVideo)
    issues.push({ level: "warning", code: "video_missing", message: "Video not rendered yet — render it or attach a video before publishing." });
  if (item.contentType === "image" && !hasImage) issues.push({ level: "warning", code: "image_missing", message: "No image attached yet." });
  if (item.contentType === "carousel" && item.carousel.length < 2) issues.push({ level: "warning", code: "carousel_short", message: "Carousel needs at least 2 slides." });
  for (const m of media) {
    if (m.mime.startsWith("image/") && m.width && m.height && Math.min(m.width, m.height) < 600)
      issues.push({ level: "warning", code: "low_res", message: `${m.name} is low resolution (${m.width}×${m.height}).` });
    if (m.size > 200 * 1024 * 1024) issues.push({ level: "error", code: "too_big", message: `${m.name} is larger than 200 MB.` });
  }

  // Brand & claims
  const profile = getProfile();
  if (/too many emojis|no emojis|few emojis|limit emojis/i.test(profile.customRules)) {
    const emojis = caption.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;
    if (emojis > 3) issues.push({ level: "warning", code: "emoji", message: `Uses ${emojis} emojis; brand rules limit emoji use.` });
  }
  if (CLAIM_WORDS.test(caption)) issues.push({ level: "warning", code: "claims", message: "Contains a strong claim (e.g. guarantee/No.1/award). Make sure it is true and can be supported." });
  if (!item.cta.trim()) issues.push({ level: "info", code: "no_cta", message: "No CTA — fine for value posts; add one if you want a response." });

  // Links
  if (opts.checkLinks !== false) {
    const urls = [...new Set([...(caption.match(/https?:\/\/[^\s)]+/g) ?? []), ...(item.link ? [item.link] : [])])].slice(0, 5);
    for (const u of urls) if (!(await linkOk(u))) issues.push({ level: "warning", code: "broken_link", message: `Link may be broken: ${u}` });
  }

  // Duplicates
  const dups = findDuplicates(item);
  if (dups.length) issues.push({ level: "warning", code: "duplicate", message: `Similar content detected: ${dups[0].reason} — "${dups[0].title}".` });

  for (const n of aiNotes) if (n.trim()) issues.push({ level: "warning", code: "ai_review", message: n.trim() });
  return issues;
}

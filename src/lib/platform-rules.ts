// Per-platform content rules used by the Hashtag, CTA and Quality agents and by
// the publishing adapters. Pure module (no server imports) so it is unit-testable.

import type { ContentType, Platform } from "./types.ts";

export type PlatformRules = {
  maxChars: number;
  maxHashtags: number;
  idealHashtags: [number, number];
  style: string;
  supportedTypes: ContentType[];
  requiresMedia: boolean; // platform cannot publish text-only
  requiresVideo: boolean;
  maxCarouselItems: number;
  titleMax?: number;
};

export const PLATFORM_RULES: Record<Platform, PlatformRules> = {
  linkedin: {
    maxChars: 3000,
    maxHashtags: 5,
    idealHashtags: [3, 5],
    style:
      "Professional and informative. Strong first line hook (it is cut after ~210 chars), short paragraphs, white space, insight-led, soft CTA.",
    supportedTypes: ["text", "image", "carousel", "video", "article"],
    requiresMedia: false,
    requiresVideo: false,
    maxCarouselItems: 20,
  },
  instagram: {
    maxChars: 2200,
    maxHashtags: 30,
    idealHashtags: [5, 12],
    style: "Short, visual and engaging. Hook in the first line, emojis used sparingly, line breaks, hashtags at the end.",
    supportedTypes: ["image", "carousel", "reel", "video"],
    requiresMedia: true,
    requiresVideo: false,
    maxCarouselItems: 10,
  },
  facebook: {
    maxChars: 63206,
    maxHashtags: 5,
    idealHashtags: [1, 3],
    style: "Conversational and community-focused. Ask questions, friendly tone, 1–3 hashtags at most.",
    supportedTypes: ["text", "image", "carousel", "video", "reel", "article"],
    requiresMedia: false,
    requiresVideo: false,
    maxCarouselItems: 10,
  },
  youtube: {
    maxChars: 5000,
    maxHashtags: 15,
    idealHashtags: [3, 5],
    style: "Search-friendly title (under 100 chars) + detailed description with keywords + tags. Video-first.",
    supportedTypes: ["short", "video"],
    requiresMedia: true,
    requiresVideo: true,
    maxCarouselItems: 0,
    titleMax: 100,
  },
  x: {
    maxChars: 280,
    maxHashtags: 2,
    idealHashtags: [0, 2],
    style: "Concise and punchy. One idea, under 280 characters including hashtags, 0–2 hashtags.",
    supportedTypes: ["text", "image", "video"],
    requiresMedia: false,
    requiresVideo: false,
    maxCarouselItems: 4,
  },
  tiktok: {
    maxChars: 2200,
    maxHashtags: 8,
    idealHashtags: [3, 6],
    style: "Short hook in the first 2 seconds, video-first, casual and energetic caption.",
    supportedTypes: ["short", "reel", "video"],
    requiresMedia: true,
    requiresVideo: true,
    maxCarouselItems: 0,
    titleMax: 150,
  },
  pinterest: {
    maxChars: 500,
    maxHashtags: 5,
    idealHashtags: [2, 5],
    style: "Search-friendly title (under 100 chars) and keyword-rich description. Inspirational, evergreen.",
    supportedTypes: ["image"],
    requiresMedia: true,
    requiresVideo: false,
    maxCarouselItems: 0,
    titleMax: 100,
  },
};

const SPAM_TAGS = new Set([
  "followforfollow",
  "f4f",
  "like4like",
  "l4l",
  "follow4follow",
  "likeforlike",
  "followback",
  "instagood",
  "tagsforlikes",
  "spam",
  "viral",
  "fyp",
  "foryou",
  "foryoupage",
]);

/** Hashtag Agent post-processing: normalise, de-duplicate, drop spam, cap to platform limit. */
export function cleanHashtags(tags: string[], platform: Platform): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (t.length < 2 || t.length > 40) continue;
    const key = t.toLowerCase();
    if (SPAM_TAGS.has(key) || seen.has(key)) continue;
    // TikTok users do use #fyp; still considered low-value so only keep it there.
    seen.add(key);
    out.push(`#${t}`);
  }
  return out.slice(0, PLATFORM_RULES[platform].maxHashtags);
}

/** Full text as it will be published (caption body + CTA + hashtags). */
export function composeCaption(c: { hook: string; body: string; cta: string; hashtags: string[] }): string {
  const parts: string[] = [];
  const body = c.body.trim();
  if (c.hook.trim() && !body.startsWith(c.hook.trim())) parts.push(c.hook.trim());
  if (body) parts.push(body);
  if (c.cta.trim() && !body.includes(c.cta.trim())) parts.push(c.cta.trim());
  if (c.hashtags.length) parts.push(c.hashtags.join(" "));
  return parts.join("\n\n");
}

/** Word-shingle Jaccard similarity used for duplicate detection. */
export function similarity(a: string, b: string): number {
  const sh = (s: string) => {
    const words = s
      .toLowerCase()
      .replace(/#[\p{L}\p{N}_]+/gu, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
    const set = new Set<string>();
    for (let i = 0; i < words.length - 2; i++) set.add(words.slice(i, i + 3).join(" "));
    if (!set.size && words.length) set.add(words.join(" "));
    return set;
  };
  const A = sh(a);
  const B = sh(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function normaliseTopic(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

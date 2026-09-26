import "server-only";
import { z } from "zod";
import { generateStructured } from "./client";
import { AGENT_PRINCIPLES, brandContext, memoryContext, platformGuide } from "./context";
import { CATEGORIES, CONTENT_TYPES, PLATFORMS, type ContentItem, type ContentType, type Platform } from "../types";
import { PLATFORM_RULES } from "../platform-rules";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const SlideSchema = z.object({
  heading: z.string().describe("Short slide headline (max ~8 words)"),
  body: z.string().describe("Supporting text for the slide (max ~30 words)"),
  design: z.string().describe("Design instructions: layout, imagery, emphasis"),
});

const SceneSchema = z.object({
  label: z.string().describe("Hook | Problem | Solution | Benefits | CTA | ..."),
  durationSec: z.number().describe("Scene length in seconds (2–8)"),
  visual: z.string().describe("What is shown on screen"),
  onScreenText: z.string().describe("Large on-screen text, max ~8 words"),
  voiceOver: z.string().describe("Voice-over line for this scene"),
});

const VideoSchema = z.object({
  idea: z.string(),
  style: z.string(),
  script: z.string().describe("Full voice-over script"),
  scenes: z.array(SceneSchema),
  subtitles: z.string().describe("Subtitle text, one line per scene"),
  thumbnailConcept: z.string().describe("Thumbnail / cover concept with text overlay"),
});

export const PackageSchema = z.object({
  platform: z.enum(PLATFORMS),
  contentType: z.enum(CONTENT_TYPES),
  title: z.string().describe("Post title. For YouTube/Pinterest this is the search-optimised title."),
  hook: z.string().describe("The opening line that stops the scroll"),
  body: z
    .string()
    .describe("Caption/description, starting with the hook line. Do NOT include the hashtags or the CTA line here."),
  cta: z.string().describe("Call to action line, or empty string when a CTA does not fit"),
  hashtags: z.array(z.string()),
  keywords: z.array(z.string()).describe("SEO keywords (YouTube tags, Pinterest keywords)"),
  imageConcept: z.string().describe("Visual concept for the image/cover"),
  imagePrompt: z.string().describe("Detailed prompt for an image generation model"),
  headline: z.string().describe("Short text (max 8 words) to print on the generated graphic/cover"),
  carousel: z.array(SlideSchema).describe("Slides for carousel posts, otherwise empty"),
  video: VideoSchema.nullable().describe("Video plan for video/reel/short posts, otherwise null"),
  reviewNotes: z.array(z.string()).describe("Remaining quality concerns (grammar, unsupported claims, etc.). Empty if none."),
});
export type Package = z.infer<typeof PackageSchema>;

const PackagesSchema = z.object({ versions: z.array(PackageSchema) });

const IdeaSchema = z.object({
  dayOffset: z.number().describe("0 = start date, 1 = next day, ..."),
  category: z.enum(CATEGORIES),
  contentType: z.enum(CONTENT_TYPES),
  topic: z.string().describe("Specific topic (not generic)"),
  angle: z.string().describe("The angle / key message for this post"),
});
export type Idea = z.infer<typeof IdeaSchema>;

// ---------------------------------------------------------------------------
// Content type adaptation per platform
// ---------------------------------------------------------------------------

export function adaptType(type: ContentType, platform: Platform): ContentType | null {
  const supported = PLATFORM_RULES[platform].supportedTypes;
  if (supported.includes(type)) return type;
  const videoish = type === "reel" || type === "short" || type === "video";
  if (videoish) {
    if (supported.includes("reel")) return "reel";
    if (supported.includes("short")) return "short";
    if (supported.includes("video")) return "video";
    return null;
  }
  if (type === "carousel" && supported.includes("image")) return "image";
  if ((type === "text" || type === "article") && supported.includes("image")) return "image";
  return null;
}

// ---------------------------------------------------------------------------
// Content Strategy Agent
// ---------------------------------------------------------------------------

export const WEEK_TEMPLATE: { category: (typeof CATEGORIES)[number]; contentType: ContentType; label: string }[] = [
  { category: "Educational", contentType: "text", label: "Educational" },
  { category: "Tips", contentType: "reel", label: "Reel" },
  { category: "Educational", contentType: "carousel", label: "Carousel" },
  { category: "Industry knowledge", contentType: "image", label: "Industry Tip" },
  { category: "Promotional", contentType: "image", label: "Promotional" },
  { category: "Behind the scenes", contentType: "image", label: "Behind the Scenes" },
  { category: "Engagement", contentType: "text", label: "Engagement" },
];

export async function planIdeas(opts: {
  count: number;
  startDate: string; // YYYY-MM-DD
  instruction?: string;
  fixedSlots?: { dayOffset: number; category: string; contentType: ContentType }[];
}): Promise<Idea[]> {
  const slots = opts.fixedSlots
    ? `Use exactly these slots (one idea each, keep dayOffset/category/contentType):\n${opts.fixedSlots
        .map((s) => `- dayOffset ${s.dayOffset}: ${s.category} · ${s.contentType}`)
        .join("\n")}`
    : `Create ${opts.count} ideas spread across the period, mixing categories (${CATEGORIES.join(", ")}) and formats. Avoid repeating the same category twice in a row.`;
  const out = await generateStructured({
    schema: z.object({ ideas: z.array(IdeaSchema) }),
    system: `${AGENT_PRINCIPLES}\n\nYou are acting as the CONTENT STRATEGY AGENT: you plan varied, specific, non-repetitive content ideas.\n\n${brandContext()}\n\n${memoryContext()}`,
    prompt: `Plan social media content starting ${opts.startDate}.\n${slots}\n${opts.instruction ? `User instruction: ${opts.instruction}` : ""}`,
    effort: "medium",
  });
  return out.ideas.slice(0, Math.max(opts.count, opts.fixedSlots?.length ?? 0));
}

// ---------------------------------------------------------------------------
// Content Creation Agent (+ Image, Carousel, Video/Reel, Hashtag, CTA agents)
// ---------------------------------------------------------------------------

function formatInstructions(targets: { platform: Platform; contentType: ContentType }[]): string {
  const needs = new Set(targets.map((t) => t.contentType));
  const parts: string[] = [];
  if (needs.has("image"))
    parts.push(
      "IMAGE POSTS: provide imageConcept, a detailed imagePrompt (subject, composition, lighting, style, brand colors) and a short headline for the graphic.",
    );
  if (needs.has("carousel"))
    parts.push(
      "CAROUSELS: 6–8 slides following Hook → Problem → Explanation → Solution → Benefits → Tips → CTA. Each slide: heading, body, design instructions.",
    );
  if (needs.has("reel") || needs.has("short") || needs.has("video"))
    parts.push(
      "VIDEOS/REELS/SHORTS: provide a video plan: idea, style, full script, 4–6 scenes (Hook → Problem → Solution → Benefits → CTA) with durationSec, visual, onScreenText, voiceOver; subtitles; thumbnail concept. Total 15–45 seconds for short-form.",
    );
  return parts.join("\n");
}

export async function createVersions(opts: {
  topic: string;
  category: string;
  angle?: string;
  language: string;
  instruction?: string;
  videoStyle?: string;
  mediaNotes?: string;
  source?: string; // for content recycling
  targets: { platform: Platform; contentType: ContentType }[];
}): Promise<Package[]> {
  const platforms = [...new Set(opts.targets.map((t) => t.platform))];
  const out = await generateStructured({
    schema: PackagesSchema,
    system: `${AGENT_PRINCIPLES}\n\n${brandContext()}\n\n${memoryContext()}\n\n## Platform guide\n${platformGuide(platforms)}`,
    prompt: [
      `Create one version for EACH of these targets (same order):`,
      ...opts.targets.map((t, i) => `${i + 1}. platform=${t.platform}, contentType=${t.contentType}`),
      "",
      `Topic: ${opts.topic}`,
      `Content category: ${opts.category}`,
      opts.angle ? `Angle: ${opts.angle}` : "",
      `Language: ${opts.language}`,
      opts.videoStyle ? `Video style: ${opts.videoStyle}` : "",
      opts.mediaNotes ? `User-provided media: ${opts.mediaNotes}` : "",
      opts.instruction ? `User instruction: ${opts.instruction}` : "",
      opts.source
        ? `\nRepurpose this existing post. Do NOT copy it — rewrite and optimise for each target:\n"""\n${opts.source}\n"""`
        : "",
      "",
      formatInstructions(opts.targets),
    ]
      .filter(Boolean)
      .join("\n"),
  });
  // Match versions back to targets by platform/order.
  return opts.targets.map((t, i) => {
    const exact = out.versions.find((v) => v.platform === t.platform && v.contentType === t.contentType);
    const v = exact ?? out.versions.find((x) => x.platform === t.platform) ?? out.versions[i];
    if (!v) throw new Error(`AI did not return a version for ${t.platform}.`);
    return { ...v, platform: t.platform, contentType: t.contentType };
  });
}

/** Revise an existing item ("make it shorter", "more professional", "translate to Telugu", "regenerate"). */
export async function reviseContent(item: ContentItem, instruction: string): Promise<Package> {
  const out = await generateStructured({
    schema: PackageSchema,
    system: `${AGENT_PRINCIPLES}\n\n${brandContext()}\n\n## Platform guide\n${platformGuide([item.platform])}`,
    prompt: `Here is the current ${item.platform} ${item.contentType} post (JSON):\n${JSON.stringify(
      {
        title: item.title,
        hook: item.hook,
        body: item.body,
        cta: item.cta,
        hashtags: item.hashtags,
        keywords: item.keywords,
        imageConcept: item.imageConcept,
        imagePrompt: item.imagePrompt,
        carousel: item.carousel,
        video: item.video,
        language: item.language,
        topic: item.topic,
      },
      null,
      2,
    )}\n\nApply this instruction and return the complete updated post: "${instruction}".\nKeep platform=${item.platform} and contentType=${item.contentType}. Keep everything the instruction does not ask to change, unless it is a full regeneration request in which case write a fresh, different version.`,
  });
  return { ...out, platform: item.platform, contentType: item.contentType };
}

// ---------------------------------------------------------------------------
// Analytics Agent — only reasons over real, supplied numbers.
// ---------------------------------------------------------------------------

export const InsightSchema = z.object({
  summary: z.string(),
  findings: z.array(z.string()).describe("Each finding must cite the numbers it is based on"),
  recommendations: z.array(z.string()),
  ideas: z.array(z.object({ topic: z.string(), category: z.enum(CATEGORIES), contentType: z.enum(CONTENT_TYPES), why: z.string() })),
});
export type Insights = z.infer<typeof InsightSchema>;

export async function analyzePerformance(dataset: string): Promise<Insights> {
  return generateStructured({
    schema: InsightSchema,
    system: `${AGENT_PRINCIPLES}\n\nYou are the AI ANALYTICS AGENT. You analyse ONLY the performance data provided. Never invent numbers, trends or benchmarks. If the sample is small, say so explicitly. Base new content ideas on patterns actually visible in the data.\n\n${brandContext()}`,
    prompt: `Performance data (one row per published post, latest metrics fetched from the platform APIs):\n${dataset}\n\nIdentify patterns (content categories, formats, platforms, topics), give recommendations and 5 new content ideas grounded in the data.`,
    effort: "medium",
  });
}

// ---------------------------------------------------------------------------
// Main agent: intent understanding for the chat interface
// ---------------------------------------------------------------------------

export const IntentSchema = z.object({
  action: z.enum([
    "create",
    "create_week",
    "create_month",
    "create_batch",
    "revise",
    "recycle",
    "request_publish",
    "schedule",
    "show_pending",
    "publish_all_approved",
    "analytics",
    "answer",
  ]),
  platforms: z.array(z.enum(PLATFORMS)).describe("Target platforms; empty = use the business's preferred platforms"),
  contentType: z.enum(CONTENT_TYPES).nullable(),
  category: z.enum(CATEGORIES).nullable(),
  count: z.number().describe("How many posts (for create_batch); 1 otherwise"),
  topic: z.string().describe("Topic, or empty to let the strategy agent choose"),
  instruction: z.string().describe("Extra instructions: tone, length, language, style, revision request"),
  language: z.string().nullable().describe("Requested language if stated"),
  refersToPrevious: z.boolean().describe("True when the user refers to 'this', 'it', the last post"),
  scheduleLocal: z.string().nullable().describe("Requested local date-time as YYYY-MM-DDTHH:mm, if any"),
  reply: z.string().describe("Short friendly reply to show the user (for 'answer' this is the full answer)"),
});
export type Intent = z.infer<typeof IntentSchema>;

export async function understand(message: string, history: string, nowLocal: string, lastItem: string): Promise<Intent> {
  return generateStructured({
    schema: IntentSchema,
    system: `${AGENT_PRINCIPLES}\n\nYou are the main SOCIAL MEDIA MARKETING AGENT. Classify the user's request into one action and extract parameters. You cannot publish anything yourself: publishing only happens after the user clicks APPROVE & POST, or for content the user already approved.\n\nActions:\n- create: one post/reel/carousel/image/video (possibly for several platforms)\n- create_batch: N posts (e.g. "Create 10 LinkedIn posts", "Create 5 reels")\n- create_week: a week of content ("Create my week", "this week's content")\n- create_month: 30 days of content\n- revise: change the last/current post (shorter, more professional, translate, regenerate, change tone)\n- recycle: repurpose the last post for other platforms/formats\n- request_publish: user asks to post/publish "this" — the UI will show APPROVE & POST, never auto-publish\n- schedule: schedule "this" for a date/time (requires approval in UI)\n- show_pending: show pending approvals\n- publish_all_approved: publish all content the user has already approved\n- analytics: questions about performance\n- answer: general marketing question / anything else\n\n${brandContext()}`,
    prompt: `Current local time: ${nowLocal}\nLast post in this conversation: ${lastItem || "(none)"}\n\nRecent conversation:\n${history || "(none)"}\n\nUser: ${message}`,
    effort: "low",
  });
}

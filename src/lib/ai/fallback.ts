import "server-only";
import type { Idea, Intent, Package } from "./agents";
import { WEEK_TEMPLATE } from "./agents";
import { getProfile } from "../repo/misc";
import { PLATFORM_RULES, cleanHashtags } from "../platform-rules";
import { CATEGORIES, PLATFORMS, type ContentType, type Platform } from "../types";

// Deterministic template generator used when no AI key is configured, so the
// full CREATE → REVIEW → APPROVE → POST workflow can still be exercised.
// Items produced here are marked generator="template" and flagged in the UI.

function tagify(s: string): string {
  return s
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}

export function templatePackage(t: {
  topic: string;
  category: string;
  platform: Platform;
  contentType: ContentType;
  language: string;
}): Package {
  const p = getProfile();
  const biz = p.businessName || "our team";
  const topic = t.topic || `${p.industry || "our industry"} insights`;
  const hook =
    t.category === "Promotional"
      ? `Looking for ${topic.toLowerCase()}? Here's why people choose ${biz}.`
      : t.category === "Engagement"
        ? `Quick question: what's your biggest challenge with ${topic.toLowerCase()}?`
        : `${topic}: 3 things most people overlook.`;
  const points = [
    `Start with a clear goal — it saves time and money later.`,
    `Choose quality over shortcuts; it pays back over the long term.`,
    `Work with specialists who explain every step.`,
  ];
  const short = PLATFORM_RULES[t.platform].maxChars <= 300;
  const body = short
    ? `${hook} ${points[0]}`
    : `${hook}\n\n${points.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\n${p.location ? `Serving ${p.location}. ` : ""}${biz} helps with ${p.services || topic.toLowerCase()}.`;
  const cta = t.category === "Engagement" ? "Share your thoughts in the comments." : p.website ? `Learn more: ${p.website}` : "Send us a message to learn more.";
  const hashtags = cleanHashtags(
    [tagify(topic), tagify(p.industry || "Business"), tagify(p.location || ""), tagify(t.category), tagify(biz)],
    t.platform,
  );
  const isVideo = ["reel", "short", "video"].includes(t.contentType);
  return {
    platform: t.platform,
    contentType: t.contentType,
    title: topic,
    hook,
    body,
    cta,
    hashtags,
    keywords: [topic, p.industry, p.location].filter(Boolean),
    imageConcept: `Clean branded graphic about "${topic}" using brand colors.`,
    imagePrompt: `Professional social media visual about ${topic} for ${biz}, ${p.brandStyle || "modern clean"} style, brand colors ${p.brandColors.join(", ")}.`,
    headline: topic.split(" ").slice(0, 8).join(" "),
    carousel:
      t.contentType === "carousel"
        ? [
            { heading: hook.slice(0, 60), body: "Swipe to learn more →", design: "Bold title on brand color" },
            { heading: "The problem", body: `Many people struggle with ${topic.toLowerCase()}.`, design: "Icon + short text" },
            { heading: "Why it happens", body: "Unclear planning and rushed decisions.", design: "Simple diagram" },
            { heading: "The solution", body: points[0], design: "Checklist style" },
            { heading: "Benefits", body: points[1], design: "Two-column layout" },
            { heading: "Pro tip", body: points[2], design: "Highlight box" },
            { heading: "Let's talk", body: cta, design: "Logo + contact details" },
          ]
        : [],
    video: isVideo
      ? {
          idea: `Short explainer about ${topic}`,
          style: "Modern",
          script: `${hook} ${points.join(" ")} ${cta}`,
          scenes: [
            { label: "Hook", durationSec: 3, visual: "Bold title card", onScreenText: hook.slice(0, 50), voiceOver: hook },
            { label: "Problem", durationSec: 4, visual: "Relatable problem shot", onScreenText: "The common mistake", voiceOver: `Many people get ${topic.toLowerCase()} wrong.` },
            { label: "Solution", durationSec: 5, visual: "Product/service in action", onScreenText: points[0].slice(0, 45), voiceOver: points[0] },
            { label: "Benefits", durationSec: 4, visual: "Happy customer / result", onScreenText: "Better results", voiceOver: points[1] },
            { label: "CTA", durationSec: 3, visual: "Logo and contact", onScreenText: "Contact us today", voiceOver: cta },
          ],
          subtitles: [hook, points[0], points[1], cta].join("\n"),
          thumbnailConcept: `Bold text "${topic}" on brand color background`,
        }
      : null,
    reviewNotes: ["Generated from a template because AI is not configured. Please review and personalise before approving."],
  };
}

export function templateIdeas(count: number, fixed?: { dayOffset: number; category: string; contentType: ContentType }[]): Idea[] {
  const p = getProfile();
  const base = [p.products, p.services, p.industry].join(",").split(",").map((s) => s.trim()).filter(Boolean);
  const subjects = base.length ? base : ["our services", "customer success", "industry trends"];
  const slots =
    fixed ??
    Array.from({ length: count }, (_, i) => ({
      dayOffset: i,
      category: WEEK_TEMPLATE[i % 7].category,
      contentType: WEEK_TEMPLATE[i % 7].contentType,
    }));
  return slots.map((s, i) => ({
    dayOffset: s.dayOffset,
    category: (CATEGORIES as readonly string[]).includes(s.category) ? (s.category as Idea["category"]) : "Educational",
    contentType: s.contentType,
    topic: `${s.category}: ${subjects[i % subjects.length]}`,
    angle: `${s.category} angle on ${subjects[i % subjects.length]}`,
  }));
}

/** Keyword intent parser used when no AI key is configured. */
export function templateIntent(message: string): Intent {
  const m = message.toLowerCase();
  const platforms = PLATFORMS.filter((p) => m.includes(p === "x" ? "twitter" : p) || (p === "x" && /\bx\b/.test(m)));
  const num = Number(m.match(/\b(\d{1,2})\b/)?.[1] ?? 1);
  const type: ContentType | null = /reel/.test(m)
    ? "reel"
    : /short/.test(m)
      ? "short"
      : /carousel/.test(m)
        ? "carousel"
        : /video/.test(m)
          ? "video"
          : /image/.test(m)
            ? "image"
            : null;
  const base: Intent = {
    action: "answer",
    platforms,
    contentType: type,
    category: /promot/.test(m) ? "Promotional" : /educat/.test(m) ? "Educational" : null,
    count: 1,
    topic: message.replace(/^(please\s+)?create\s+(a|an|today'?s|\d+)?\s*/i, "").slice(0, 120),
    instruction: message,
    language: /telugu/.test(m) ? (/english/.test(m) ? "Telugu + English" : "Telugu") : /hindi/.test(m) ? "Hindi" : null,
    refersToPrevious: /\b(this|it|that)\b/.test(m),
    scheduleLocal: null,
    reply: "",
  };
  if (/pending|approval/.test(m)) return { ...base, action: "show_pending", reply: "Here are the posts waiting for your approval." };
  if (/publish all approved/.test(m)) return { ...base, action: "publish_all_approved" };
  if (/30 days|month/.test(m)) return { ...base, action: "create_month", reply: "Creating 30 days of content." };
  if (/week/.test(m)) return { ...base, action: "create_week", reply: "Creating your week of content." };
  if (/schedule/.test(m)) return { ...base, action: "schedule", refersToPrevious: true, reply: "Open the post to choose date, time and time zone." };
  if (/^(post|publish)\b/.test(m)) return { ...base, action: "request_publish", refersToPrevious: true };
  if (/shorter|longer|professional|tone|translate|regenerate|another version|rewrite|casual|friendly/.test(m))
    return { ...base, action: "revise", refersToPrevious: true, reply: "Updated the post." };
  if (/create|make|write|generate/.test(m)) {
    if (num > 1) return { ...base, action: "create_batch", count: Math.min(num, 30), reply: `Creating ${num} posts.` };
    return { ...base, action: "create", reply: "I've created the post. Please review it." };
  }
  if (/analytic|perform|engagement/.test(m)) return { ...base, action: "analytics" };
  return {
    ...base,
    reply:
      "AI is not configured yet, so I can only run template commands. Try: “Create today's LinkedIn post about …”, “Create my week”, “Show my pending approvals”. Add ANTHROPIC_API_KEY to enable the full agent.",
  };
}

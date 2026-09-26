import "server-only";
import { getProfile, latestMetrics } from "../repo/misc";
import { listContent, recentTopics } from "../repo/content";
import { PLATFORM_RULES } from "../platform-rules";
import { PLATFORM_LABEL, type Platform } from "../types";

// AI Memory: everything the agent "remembers" about the business is assembled
// here from the business profile, brand rules, approved/published history and
// real analytics. Credentials are never part of this context.

export function brandContext(): string {
  const p = getProfile();
  const lines = [
    `Business name: ${p.businessName || "(not set)"}`,
    `Description: ${p.description || "(not set)"}`,
    `Industry: ${p.industry || "(not set)"}`,
    `Products: ${p.products || "(not set)"}`,
    `Services: ${p.services || "(not set)"}`,
    `Target audience: ${p.targetAudience || "(not set)"}`,
    `Location: ${p.location || "(not set)"}`,
    `Website: ${p.website || "(none)"}`,
    `Contact: ${p.contact || "(none)"}`,
    `WhatsApp: ${p.whatsapp || "(none)"}`,
    `Brand style: ${p.brandStyle || "(not set)"}`,
    `Brand colors: ${p.brandColors.join(", ")}`,
    `Brand voice: ${p.brandVoice}`,
    `Preferred tone: ${p.preferredTone}`,
    `Preferred language: ${p.preferredLanguage}`,
    `Preferred platforms: ${p.preferredPlatforms.map((x) => PLATFORM_LABEL[x]).join(", ")}`,
    `Posting frequency: ${p.postingFrequency}`,
  ];
  const rules = p.customRules.trim();
  return [
    "## Business profile",
    ...lines,
    "",
    "## Brand rules (always follow these exactly)",
    rules || "(no custom rules)",
  ].join("\n");
}

export function memoryContext(): string {
  const topics = recentTopics(40);
  const approved = listContent({ status: ["APPROVED", "SCHEDULED", "PUBLISHED"], limit: 5 });
  const examples = approved
    .map((c) => `- [${PLATFORM_LABEL[c.platform]} · ${c.category}] ${c.hook || c.title}`)
    .join("\n");
  const perf = performanceSummary();
  return [
    "## Previously covered topics (avoid repeating these angles)",
    topics.length ? topics.map((t) => `- ${t}`).join("\n") : "(none yet)",
    "",
    "## Recently approved content (the user liked this style)",
    examples || "(none yet)",
    "",
    "## Real performance data",
    perf || "(no analytics collected yet — do not assume any performance facts)",
  ].join("\n");
}

function performanceSummary(): string {
  const snaps = latestMetrics();
  if (!snaps.length) return "";
  const items = new Map(listContent({ status: ["PUBLISHED"], limit: 500 }).map((c) => [c.id, c]));
  const byCat = new Map<string, { n: number; eng: number }>();
  for (const s of snaps) {
    const c = items.get(s.contentId);
    if (!c) continue;
    const eng = (s.data.likes ?? 0) + (s.data.comments ?? 0) + (s.data.shares ?? 0) + (s.data.saves ?? 0);
    const cur = byCat.get(c.category) ?? { n: 0, eng: 0 };
    cur.n++;
    cur.eng += eng;
    byCat.set(c.category, cur);
  }
  return [...byCat.entries()]
    .map(([cat, v]) => `- ${cat}: ${v.n} posts measured, avg engagement ${(v.eng / v.n).toFixed(1)}`)
    .join("\n");
}

export function platformGuide(platforms: Platform[]): string {
  return platforms
    .map((p) => {
      const r = PLATFORM_RULES[p];
      return `- ${PLATFORM_LABEL[p]} (${p}): ${r.style} Max ${r.maxChars} chars; ${r.idealHashtags[0]}–${r.idealHashtags[1]} hashtags (max ${r.maxHashtags}). Supported formats: ${r.supportedTypes.join(", ")}.${r.titleMax ? ` Title max ${r.titleMax} chars.` : ""}`;
    })
    .join("\n");
}

export const AGENT_PRINCIPLES = `You are the Social Media Marketing Agent inside a publishing platform.
You create social media content for ONE business, described below. Your content is always reviewed and approved by the user before anything is published — you never claim that something has been posted.

Principles:
- Write for the specific platform. Never paste the same text across platforms; rewrite and optimise each version.
- Follow the brand voice, preferred language and brand rules exactly. When the language is bilingual (e.g. "Telugu + English", Hinglish, Tanglish) write natural code-mixed text the way real people in that region write online, using the native script for Telugu/Hindi portions unless told otherwise.
- Do not invent facts, statistics, prices, awards, testimonials, client names or guarantees. If a claim needs evidence the profile does not give, phrase it generally or flag it in reviewNotes.
- Hashtags: relevant to business, industry, topic, location, product and audience. No spam or irrelevant tags. Respect the platform's hashtag range.
- CTAs: use one only when it fits (Learn more, Contact us, Send us a message, Visit our website, Follow for more, Share your opinion, Comment below, Book a consultation...). An empty CTA is fine for pure value posts.
- Keep emoji usage consistent with brand rules.
- Self-review your output for grammar, spelling, brand consistency, platform suitability and unsupported claims; report any remaining concerns in reviewNotes (empty if none).`;

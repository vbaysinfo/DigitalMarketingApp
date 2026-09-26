import "server-only";
import { aiConfigured } from "./ai/client";
import { understand, analyzePerformance, type Intent } from "./ai/agents";
import { templateIntent } from "./ai/fallback";
import { addChat, getProfile, getSettings, listChat } from "./repo/misc";
import { getContent, listContent } from "./repo/content";
import { createCalendar, createNow, recycleItem, reviseItem, targetsFor } from "./generation";
import { publishContent } from "./publishing/publisher";
import { analyticsDataset } from "./analytics";
import { utcToZoned } from "./time";
import { CATEGORIES, PLATFORM_LABEL, type ContentItem } from "./types";

// Main SOCIAL MEDIA MARKETING AGENT (chat). Decision flow:
// understand → platform → content type → profile & brand rules → generate → media → optimise →
// quality check → preview → WAIT FOR APPROVAL. It never publishes unapproved content: requests like
// "post this on LinkedIn" return the preview with the APPROVE & POST button.

export type AgentReply = { reply: string; contentIds: string[]; link?: string };

function lastContentId(): string | null {
  const msgs = listChat(50).reverse();
  for (const m of msgs) if (m.contentIds.length) return m.contentIds[0];
  return null;
}

function describe(c: ContentItem | null): string {
  if (!c) return "";
  return `${PLATFORM_LABEL[c.platform]} ${c.contentType} (${c.status}) — "${(c.hook || c.title).slice(0, 120)}"`;
}

export async function handleChat(message: string): Promise<AgentReply> {
  addChat("user", message);
  let result: AgentReply;
  try {
    result = await execute(message);
  } catch (e) {
    result = { reply: `Sorry — ${(e as Error).message}`, contentIds: [] };
  }
  addChat("assistant", result.reply, result.contentIds);
  return result;
}

async function execute(message: string): Promise<AgentReply> {
  const s = getSettings();
  const lastId = lastContentId();
  const last = lastId ? getContent(lastId) : null;
  const history = listChat(12)
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join("\n");
  const intent: Intent = aiConfigured()
    ? await understand(message, history, utcToZoned(new Date().toISOString(), s.timezone), describe(last))
    : templateIntent(message);
  const profile = getProfile();
  const language = intent.language || profile.preferredLanguage;
  const category = intent.category ?? (CATEGORIES.find((c) => message.toLowerCase().includes(c.toLowerCase())) || "Educational");

  switch (intent.action) {
    case "create": {
      const items = await createNow({
        topic: intent.topic || `${profile.businessName || "Our business"} — ${category.toLowerCase()} post`,
        category,
        targets: targetsFor(intent.platforms, intent.contentType),
        language,
        instruction: intent.instruction,
      });
      return {
        reply: `${intent.reply || "I've created the content."} Please review ${items.length > 1 ? `the ${items.length} platform versions` : "it"} below — nothing is posted until you click APPROVE & POST.`,
        contentIds: items.map((i) => i.id),
      };
    }
    case "create_batch":
    case "create_week":
    case "create_month": {
      const kind = intent.action === "create_week" ? "week" : intent.action === "create_month" ? "month" : "batch";
      const r = await createCalendar(kind, {
        platforms: intent.platforms,
        count: Math.min(Math.max(1, Math.round(intent.count || 5)), 30),
        contentType: intent.contentType,
        language,
        instruction: intent.instruction,
        category: intent.category,
        topic: intent.topic,
      });
      return {
        reply: `${intent.reply || "On it."} I've planned ${r.groups} ideas (${r.items} platform posts) and added them to your calendar. They're being written now and will appear in **Waiting for approval** — I'll notify you when they're ready. Nothing will be published without your approval.`,
        contentIds: [],
        link: "/calendar",
      };
    }
    case "revise": {
      if (!last) return { reply: "Which post should I change? Create one first or open it from the Content Library.", contentIds: [] };
      if (["PUBLISHED", "PUBLISHING"].includes(last.status)) {
        const items = await recycleItem(last.id, [{ platform: last.platform, contentType: last.contentType }]);
        return { reply: "That post is already published, so I created a new version for review.", contentIds: items.map((i) => i.id) };
      }
      const siblings = last.groupId ? listContent({ groupId: last.groupId }).filter((c) => !["PUBLISHED", "PUBLISHING", "CANCELLED"].includes(c.status)) : [last];
      const targets = intent.platforms.length ? siblings.filter((c) => intent.platforms.includes(c.platform)) : siblings;
      const updated: ContentItem[] = [];
      for (const c of targets.length ? targets : [last]) updated.push(await reviseItem(c.id, intent.instruction || message));
      const reset = updated.some((u) => u.status === "WAITING_FOR_APPROVAL");
      return {
        reply: `${intent.reply || "Updated."}${reset ? " The changes need your approval again." : ""}`,
        contentIds: updated.map((u) => u.id),
      };
    }
    case "recycle": {
      if (!last) return { reply: "Tell me which post to repurpose (open it in the Content Library and click Recycle).", contentIds: [] };
      const targets = targetsFor(intent.platforms.length ? intent.platforms : profile.preferredPlatforms.filter((p) => p !== last.platform), intent.contentType);
      const items = await recycleItem(last.id, targets);
      return { reply: `I've rewritten it for ${items.map((i) => PLATFORM_LABEL[i.platform]).join(", ")}. Review each version below.`, contentIds: items.map((i) => i.id) };
    }
    case "request_publish":
    case "schedule": {
      let target = last;
      if (intent.platforms.length && last?.groupId) {
        target = listContent({ groupId: last.groupId }).find((c) => c.platform === intent.platforms[0]) ?? last;
      }
      if (!target) return { reply: "There's no post in this conversation yet. Ask me to create one first.", contentIds: [] };
      if (intent.action === "schedule" && intent.scheduleLocal) {
        return {
          reply: `Ready to schedule for ${intent.scheduleLocal.replace("T", " ")} (${s.timezone}). Open the preview and click **APPROVE & SCHEDULE** — the time is pre-filled. I don't schedule anything without your approval.`,
          contentIds: [target.id],
          link: `/library/${target.id}?schedule=${encodeURIComponent(intent.scheduleLocal)}`,
        };
      }
      return {
        reply:
          target.status === "PUBLISHED"
            ? "That post is already published."
            : "Here's the final preview. Click **APPROVE & POST** to publish it — I only publish after your approval.",
        contentIds: [target.id],
      };
    }
    case "show_pending": {
      const items = listContent({ status: ["WAITING_FOR_APPROVAL"], limit: 20 });
      return {
        reply: items.length ? `You have ${items.length} post(s) waiting for approval.` : "Nothing is waiting for approval right now.",
        contentIds: items.map((i) => i.id).slice(0, 10),
        link: "/library?status=WAITING_FOR_APPROVAL",
      };
    }
    case "publish_all_approved": {
      const items = listContent({ status: ["APPROVED"], limit: 50 });
      if (!items.length) return { reply: "There are no approved posts waiting to be published. (I never publish content that hasn't been approved.)", contentIds: [] };
      let ok = 0;
      const errors: string[] = [];
      for (const it of items) {
        const r = await publishContent(it.id, { trigger: "bulk" });
        if (r.ok) ok++;
        else errors.push(`${PLATFORM_LABEL[it.platform]}: ${r.error}`);
      }
      return {
        reply: `Published ${ok} of ${items.length} approved posts.${errors.length ? `\n\nFailed:\n- ${errors.join("\n- ")}` : ""}`,
        contentIds: items.map((i) => i.id),
        link: "/history",
      };
    }
    case "analytics": {
      const data = analyticsDataset();
      if (!data.rows) return { reply: "I don't have analytics yet. Once posts are published and metrics are synced from the platforms, I can analyse them — I won't guess numbers.", contentIds: [], link: "/analytics" };
      if (!aiConfigured()) return { reply: `Metrics are available for ${data.rows} posts. Open Analytics to see them.`, contentIds: [], link: "/analytics" };
      const ins = await analyzePerformance(data.table);
      return { reply: `${ins.summary}\n\n${ins.findings.map((f) => `- ${f}`).join("\n")}`, contentIds: [], link: "/analytics" };
    }
    default:
      return { reply: intent.reply || "How can I help with your social media today?", contentIds: [] };
  }
}

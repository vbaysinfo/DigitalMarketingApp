import "server-only";
import { aiConfigured } from "./ai/client";
import { adaptType, createVersions, planIdeas, reviseContent, WEEK_TEMPLATE, type Idea, type Package } from "./ai/agents";
import { templateIdeas, templatePackage } from "./ai/fallback";
import { createContent, editContent, getContent, listContent, setField, setStatus } from "./repo/content";
import { accountsForPlatform, isConnected } from "./repo/accounts";
import { getMedia } from "./repo/media";
import { getProfile, getSettings, notify } from "./repo/misc";
import { formatFor, generateCarousel, generatePostImage } from "./media/graphics";
import { renderVideo, videoRenderingAvailable } from "./media/video";
import { cleanHashtags, composeCaption, PLATFORM_RULES } from "./platform-rules";
import { qualityCheck } from "./quality";
import { addDays, todayIn, zonedToUtc } from "./time";
import { kvGet, kvSet, newId } from "./db";
import { PLATFORM_LABEL, type ContentItem, type ContentType, type Platform, type QualityIssue } from "./types";

// Orchestrates the agent pipeline for one idea across platforms:
//   Strategy → Creation (+Hashtag/CTA) → Media (Image/Carousel/Video) → Quality check → WAITING_FOR_APPROVAL
// Nothing here ever publishes; generated content always waits for the user's approval.

export type GroupInput = {
  topic: string;
  category: string;
  angle?: string;
  targets: { platform: Platform; contentType: ContentType }[];
  language: string;
  instruction?: string;
  videoStyle?: string;
  mediaIds?: string[];
  plannedAt?: string | null; // UTC ISO planned calendar slot (not a schedule)
  source?: string;
};

function defaultAccount(p: Platform): { accountId: string | null; destinationId: string | null } {
  const acc = accountsForPlatform(p).find(isConnected) ?? accountsForPlatform(p)[0];
  return { accountId: acc?.id ?? null, destinationId: acc?.destinations[0]?.id ?? null };
}

export function createGroup(input: GroupInput): { groupId: string; items: ContentItem[] } {
  const groupId = newId("grp");
  const items: ContentItem[] = [];
  for (const t of input.targets) {
    const type = adaptType(t.contentType, t.platform);
    if (!type) continue;
    items.push(
      createContent({
        groupId,
        platform: t.platform,
        contentType: type,
        topic: input.topic,
        category: input.category,
        language: input.language,
        status: "GENERATING",
        title: input.topic,
        scheduledAt: input.plannedAt ?? null,
        timezone: getSettings().timezone,
        mediaIds: (input.mediaIds ?? []).filter((id) => getMedia(id)),
        generator: aiConfigured() ? "ai" : "template",
        ...defaultAccount(t.platform),
      }),
    );
  }
  kvSet(`gen:${groupId}`, { ...input, targets: items.map((i) => ({ platform: i.platform, contentType: i.contentType })) });
  return { groupId, items };
}

/** Attach rendered media for the package; returns warnings instead of throwing. */
async function renderMedia(item: ContentItem, pkg: Package, userMedia: string[]): Promise<{ mediaIds: string[]; video: ContentItem["video"]; warnings: QualityIssue[] }> {
  const warnings: QualityIssue[] = [];
  const userImages = userMedia.filter((id) => getMedia(id)?.mime.startsWith("image/"));
  const userVideos = userMedia.filter((id) => getMedia(id)?.mime.startsWith("video/"));
  const name = `${PLATFORM_LABEL[item.platform]} · ${pkg.title || item.topic}`.slice(0, 120);
  const format = formatFor(item.platform, item.contentType);
  let video: ContentItem["video"] = pkg.video ? { ...pkg.video, style: pkg.video.style || "Modern" } : null;
  try {
    if (item.contentType === "image" || (item.contentType === "carousel" && !pkg.carousel.length)) {
      if (userImages.length) return { mediaIds: userImages.slice(0, 1), video, warnings };
      const img = await generatePostImage({ name, prompt: pkg.imagePrompt, headline: pkg.headline || pkg.title, kicker: item.category, format, photoId: null });
      return { mediaIds: [img.id], video, warnings };
    }
    if (item.contentType === "carousel") {
      const max = PLATFORM_RULES[item.platform].maxCarouselItems || 10;
      const { images, pdf } = await generateCarousel({ name, slides: pkg.carousel.slice(0, max), format, photoIds: userImages });
      return { mediaIds: item.platform === "linkedin" ? [pdf.id] : images.map((i) => i.id), video, warnings };
    }
    if (["reel", "short", "video"].includes(item.contentType) && video) {
      if (userVideos.length && !userImages.length && video.scenes.length <= 1) return { mediaIds: userVideos.slice(0, 1), video, warnings };
      if (!videoRenderingAvailable()) {
        warnings.push({ level: "warning", code: "video_renderer", message: "Video renderer (ffmpeg) is not available; attach a video manually." });
        return { mediaIds: userVideos.slice(0, 1), video, warnings };
      }
      const r = await renderVideo({ name, plan: video, format: item.platform === "youtube" && item.contentType === "video" ? "landscape" : "story", mediaIds: userMedia });
      video = { ...video, thumbnailMediaId: r.thumbnail.id };
      return { mediaIds: [r.video.id], video, warnings };
    }
  } catch (e) {
    warnings.push({ level: "warning", code: "media_render", message: `Media generation failed: ${(e as Error).message}` });
  }
  return { mediaIds: userMedia.filter((id) => getMedia(id)), video, warnings };
}

async function applyPackage(item: ContentItem, pkg: Package, userMedia: string[], opts: { renderMedia: boolean }): Promise<ContentItem> {
  const hashtags = cleanHashtags(pkg.hashtags, item.platform);
  const media = opts.renderMedia ? await renderMedia(item, pkg, userMedia) : { mediaIds: item.mediaIds, video: pkg.video ?? item.video, warnings: [] };
  const fields: Partial<ContentItem> = {
    title: pkg.title,
    hook: pkg.hook,
    body: pkg.body,
    cta: pkg.cta,
    hashtags,
    keywords: pkg.keywords,
    imagePrompt: pkg.imagePrompt,
    imageConcept: pkg.imageConcept,
    carousel: pkg.carousel,
    video: media.video,
    mediaIds: media.mediaIds,
  };
  const merged = { ...item, ...fields };
  const quality = [...media.warnings, ...(await qualityCheck(merged, pkg.reviewNotes))];
  if (item.status === "GENERATING") {
    setField(item.id, { ...fields, quality, lastError: null });
    return setStatus(item.id, "WAITING_FOR_APPROVAL");
  }
  const edited = editContent(item.id, { ...fields, quality });
  return edited.status === "DRAFT" ? setStatus(item.id, "WAITING_FOR_APPROVAL") : edited;
}

export async function runGroup(groupId: string): Promise<ContentItem[]> {
  const input = kvGet<GroupInput | null>(`gen:${groupId}`, null);
  if (!input) return [];
  const order = (p: Platform) => input.targets.findIndex((t) => t.platform === p);
  const items = listContent({ groupId })
    .filter((i) => i.status === "GENERATING")
    .sort((a, b) => order(a.platform) - order(b.platform));
  if (!items.length) return [];
  const targets = items.map((i) => ({ platform: i.platform, contentType: i.contentType }));
  try {
    const mediaNotes = (input.mediaIds ?? [])
      .map(getMedia)
      .filter(Boolean)
      .map((m) => `${m!.name} (${m!.mime})`)
      .join(", ");
    const pkgs = aiConfigured()
      ? await createVersions({ ...input, targets, mediaNotes })
      : targets.map((t) => templatePackage({ topic: input.topic, category: input.category, language: input.language, ...t }));
    const out: ContentItem[] = [];
    for (let i = 0; i < items.length; i++) out.push(await applyPackage(items[i], pkgs[i], input.mediaIds ?? [], { renderMedia: true }));
    return out;
  } catch (e) {
    for (const it of items) {
      setField(it.id, { lastError: `Generation failed: ${(e as Error).message}`, quality: [{ level: "error", code: "generation", message: (e as Error).message }] });
      setStatus(it.id, "DRAFT");
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Background queue for batches (week / month / N posts)
// ---------------------------------------------------------------------------

type G = typeof globalThis & { __genQueue?: string[]; __genActive?: number };
const g = globalThis as G;
g.__genQueue ??= [];
g.__genActive ??= 0;
const CONCURRENCY = Number(process.env.GENERATION_CONCURRENCY || 2);

export function enqueueGroups(ids: string[], label?: string) {
  g.__genQueue!.push(...ids);
  if (label) kvSet(`batch:${ids[0]}`, { label, total: ids.length, ids });
  pump(label ? { label, ids } : undefined);
}

function pump(batch?: { label: string; ids: string[] }) {
  while (g.__genActive! < CONCURRENCY && g.__genQueue!.length) {
    const id = g.__genQueue!.shift()!;
    g.__genActive!++;
    runGroup(id)
      .catch(() => undefined)
      .finally(() => {
        g.__genActive!--;
        if (batch && batch.ids.every((x) => !g.__genQueue!.includes(x)) && g.__genActive === 0) {
          const n = batch.ids.flatMap((x) => listContent({ groupId: x })).filter((c) => c.status === "WAITING_FOR_APPROVAL").length;
          notify("approval", `${batch.label} ready for review`, `${n} posts are waiting for your approval.`, "/library?status=WAITING_FOR_APPROVAL");
        }
        pump(batch);
      });
  }
}

/** Called on server start: resume groups that were generating when the server stopped. */
export function resumeGenerating() {
  const groups = new Set(listContent({ status: ["GENERATING"] }).map((c) => c.groupId).filter(Boolean) as string[]);
  if (groups.size) enqueueGroups([...groups]);
}

// ---------------------------------------------------------------------------
// High-level operations used by UI + chat agent
// ---------------------------------------------------------------------------

export function targetsFor(platforms: Platform[], type: ContentType | null): { platform: Platform; contentType: ContentType }[] {
  const ps = platforms.length ? platforms : getProfile().preferredPlatforms;
  return ps
    .map((p) => ({ platform: p, contentType: adaptType(type ?? (p === "youtube" || p === "tiktok" ? "short" : p === "instagram" || p === "pinterest" ? "image" : "text"), p) }))
    .filter((t): t is { platform: Platform; contentType: ContentType } => t.contentType !== null);
}

export async function createNow(input: GroupInput): Promise<ContentItem[]> {
  const { groupId, items } = createGroup(input);
  if (!items.length) throw new Error("None of the selected platforms support this content type.");
  notify("generating", "Generating content", input.topic, null);
  const out = await runGroup(groupId);
  notify("approval", "Approval required", `${out.length} new post(s): ${input.topic}`, out[0] ? `/library/${out[0].id}` : "/library");
  return out;
}

async function planned(count: number, fixed?: { dayOffset: number; category: string; contentType: ContentType }[], instruction?: string): Promise<Idea[]> {
  const start = addDays(todayIn(getSettings().timezone), 1);
  return aiConfigured() ? planIdeas({ count, startDate: start, instruction, fixedSlots: fixed }) : templateIdeas(count, fixed);
}

export async function createCalendar(kind: "week" | "month" | "batch", opts: { platforms: Platform[]; count?: number; contentType?: ContentType | null; language?: string; instruction?: string; category?: string | null; topic?: string }) {
  const s = getSettings();
  const profile = getProfile();
  const start = addDays(todayIn(s.timezone), 1);
  const fixed =
    kind === "week"
      ? WEEK_TEMPLATE.map((w, i) => ({ dayOffset: i, category: w.category, contentType: w.contentType }))
      : kind === "batch"
        ? Array.from({ length: opts.count ?? 5 }, (_, i) => ({ dayOffset: i, category: opts.category ?? WEEK_TEMPLATE[i % 7].category, contentType: opts.contentType ?? WEEK_TEMPLATE[i % 7].contentType }))
        : undefined;
  const instruction = [opts.topic ? `Theme/topic: ${opts.topic}` : "", opts.instruction ?? ""].filter(Boolean).join("\n");
  const ideas = await planned(kind === "month" ? 30 : (fixed?.length ?? 7), fixed, instruction);
  const groupIds: string[] = [];
  let itemCount = 0;
  for (const idea of ideas) {
    // "Create my week": slot i is weekday i (0 = Monday), placed on the next such date.
    const day =
      kind === "week"
        ? addDays(start, (((Math.round(idea.dayOffset) % 7) - weekdayMon0(start)) + 7) % 7)
        : addDays(start, Math.max(0, Math.round(idea.dayOffset)));
    const plannedAt = zonedToUtc(`${day}T${s.postingTimes[0] ?? "10:00"}`, s.timezone);
    const { groupId, items } = createGroup({
      topic: idea.topic,
      category: idea.category,
      angle: idea.angle,
      targets: targetsFor(opts.platforms, idea.contentType),
      language: opts.language || profile.preferredLanguage,
      instruction: opts.instruction,
      plannedAt,
    });
    if (items.length) {
      groupIds.push(groupId);
      itemCount += items.length;
    }
  }
  const label = kind === "week" ? "Your week of content" : kind === "month" ? "Your 30 days of content" : `${ideas.length} posts`;
  enqueueGroups(groupIds, label);
  return { groups: groupIds.length, items: itemCount };
}

function weekdayMon0(ymd: string): number {
  return (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export async function reviseItem(id: string, instruction: string): Promise<ContentItem> {
  const item = getContent(id);
  if (!item) throw new Error("Content not found");
  if (["PUBLISHING", "PUBLISHED", "CANCELLED", "GENERATING"].includes(item.status)) throw new Error(`Cannot revise content that is ${item.status}.`);
  const pkg = aiConfigured()
    ? await reviseContent(item, instruction)
    : { ...templatePackage({ topic: item.topic, category: item.category, platform: item.platform, contentType: item.contentType, language: item.language }) };
  const userMedia = item.mediaIds.filter((m) => getMedia(m)?.source === "upload");
  const visualChanged = pkg.headline !== item.title || JSON.stringify(pkg.carousel) !== JSON.stringify(item.carousel) || JSON.stringify(pkg.video?.scenes) !== JSON.stringify(item.video?.scenes);
  const needsRender = ["image", "carousel", "reel", "short", "video"].includes(item.contentType) && (visualChanged || !item.mediaIds.length) && /regenerat|image|visual|slide|video|scene|design|new version|another/i.test(instruction);
  return applyPackage(item, pkg, userMedia, { renderMedia: needsRender });
}

export async function rerenderMedia(id: string): Promise<ContentItem> {
  const item = getContent(id);
  if (!item) throw new Error("Content not found");
  const userMedia = item.mediaIds.filter((m) => getMedia(m)?.source === "upload");
  const pkg: Package = {
    platform: item.platform,
    contentType: item.contentType,
    title: item.title,
    hook: item.hook,
    body: item.body,
    cta: item.cta,
    hashtags: item.hashtags,
    keywords: item.keywords,
    imageConcept: item.imageConcept,
    imagePrompt: item.imagePrompt,
    headline: item.title,
    carousel: item.carousel,
    video: item.video,
    reviewNotes: [],
  };
  return applyPackage(item, pkg, userMedia, { renderMedia: true });
}

export async function recycleItem(id: string, targets: { platform: Platform; contentType: ContentType }[]): Promise<ContentItem[]> {
  const item = getContent(id);
  if (!item) throw new Error("Content not found");
  return createNow({
    topic: item.topic,
    category: item.category,
    targets,
    language: item.language,
    source: composeCaption(item),
    mediaIds: item.mediaIds.filter((m) => getMedia(m)?.source === "upload"),
    instruction: "Repurpose the source post for this platform and format.",
  });
}

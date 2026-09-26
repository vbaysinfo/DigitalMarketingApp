"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, SESSION_TTL_SEC, signSession } from "@/lib/session";
import { safeEqual } from "@/lib/crypto";
import {
  deleteContent,
  editContent,
  getContent,
  listContent,
  markApproved,
  setField,
  setStatus,
  TransitionError,
} from "@/lib/repo/content";
import { deleteAccount, getAccount, getSecrets, setAccountStatus } from "@/lib/repo/accounts";
import { deleteMedia, getMedia, renameMedia } from "@/lib/repo/media";
import { kvSet } from "@/lib/db";
import { clearChat, getProfile, getSettings, logPublish, markAllRead, notify, saveProfile, saveSettings } from "@/lib/repo/misc";
import { createCalendar, createNow, recycleItem, rerenderMedia, reviseItem, targetsFor } from "@/lib/generation";
import { publishContent, type PublishOutcome } from "@/lib/publishing/publisher";
import { queueApproved, syncMetrics } from "@/lib/publishing/scheduler";
import { findDuplicates } from "@/lib/publishing/duplicates";
import { handleChat, type AgentReply } from "@/lib/agent";
import { adapter } from "@/lib/platforms";
import { PlatformError } from "@/lib/platforms/http";
import { analyzePerformance, type Insights } from "@/lib/ai/agents";
import { aiConfigured } from "@/lib/ai/client";
import { analyticsDataset } from "@/lib/analytics";
import { qualityCheck } from "@/lib/quality";
import { zonedToUtc } from "@/lib/time";
import {
  PLATFORM_LABEL,
  type AppSettings,
  type BusinessProfile,
  type ContentItem,
  type ContentType,
  type Platform,
} from "@/lib/types";

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string; data?: T };

async function guard<T>(fn: () => Promise<T> | T, paths: string[] = ["/"]): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof TransitionError || e instanceof PlatformError ? e.message : (e as Error).message || "Something went wrong";
    return { ok: false, error: msg };
  }
}

// ------------------------------- Auth -------------------------------

export async function loginAction(_prev: { error?: string } | undefined, fd: FormData): Promise<{ error?: string }> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return { error: "APP_PASSWORD is not configured on the server." };
  const pw = String(fd.get("password") ?? "");
  if (!safeEqual(pw, expected)) {
    await new Promise((r) => setTimeout(r, 600));
    return { error: "Incorrect password." };
  }
  (await cookies()).set(SESSION_COOKIE, signSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  const next = String(fd.get("next") || "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ------------------------------- Profile & settings -------------------------------

export async function saveProfileAction(p: BusinessProfile) {
  return guard(() => saveProfile(p));
}

export async function saveSettingsAction(s: AppSettings) {
  return guard(() => {
    for (const t of s.postingTimes) if (!/^\d{2}:\d{2}$/.test(t)) throw new Error(`Invalid posting time "${t}" (use HH:MM).`);
    Intl.DateTimeFormat("en", { timeZone: s.timezone });
    saveSettings({ ...s, maxPostsPerDayPerPlatform: Math.max(1, Math.min(10, Math.round(s.maxPostsPerDayPerPlatform))) });
  });
}

// ------------------------------- Generation -------------------------------

export type CreateInput = {
  topic: string;
  category: string;
  platforms: Platform[];
  contentType: ContentType;
  language: string;
  instruction: string;
  videoStyle: string;
  mediaIds: string[];
};

export async function createContentAction(input: CreateInput) {
  return guard(async () => {
    if (!input.topic.trim()) throw new Error("Please enter a topic.");
    if (!input.platforms.length) throw new Error("Select at least one platform.");
    const items = await createNow({
      topic: input.topic.trim(),
      category: input.category,
      targets: targetsFor(input.platforms, input.contentType),
      language: input.language,
      instruction: input.instruction,
      videoStyle: input.videoStyle,
      mediaIds: input.mediaIds,
    });
    return items.map((i) => i.id);
  });
}

export async function createCalendarAction(kind: "week" | "month" | "batch", opts: { platforms: Platform[]; language: string; instruction: string; count?: number; contentType?: ContentType | null; topic?: string }) {
  return guard(() => createCalendar(kind, opts));
}

// ------------------------------- Editing & approval -------------------------------

export async function editContentAction(id: string, fields: Partial<ContentItem>) {
  return guard(async () => {
    const before = getContent(id);
    const after = editContent(id, fields);
    const quality = await qualityCheck(after, (before?.quality ?? []).filter((q) => q.code === "ai_review").map((q) => q.message), { checkLinks: true });
    setField(id, { quality });
    return { revokedApproval: Boolean(before?.approvedAt) && !after.approvedAt, status: after.status };
  });
}

export async function regenerateAction(id: string, instruction: string) {
  return guard(async () => (await reviseItem(id, instruction || "Regenerate: write a fresh, different version.")).id);
}

export async function rerenderMediaAction(id: string) {
  return guard(async () => (await rerenderMedia(id)).id);
}

export async function runQualityCheckAction(id: string) {
  return guard(async () => {
    const c = getContent(id);
    if (!c) throw new Error("Not found");
    const quality = await qualityCheck(c, c.quality.filter((q) => q.code === "ai_review").map((q) => q.message));
    setField(id, { quality });
    return quality;
  });
}

export async function aiFixAction(id: string) {
  return guard(async () => {
    const c = getContent(id);
    if (!c) throw new Error("Not found");
    const issues = c.quality.filter((q) => q.level !== "info").map((q) => `- ${q.message}`).join("\n");
    return (await reviseItem(id, `Fix these quality issues while keeping the message:\n${issues}`)).id;
  });
}

export async function submitForApprovalAction(id: string) {
  return guard(() => setStatus(id, "WAITING_FOR_APPROVAL").id);
}

export async function approveAction(id: string) {
  return guard(() => {
    const c = markApproved(id);
    notify("approved", "Content approved", `${PLATFORM_LABEL[c.platform]}: ${c.title || c.hook}`, `/library/${id}`);
    logPublish({ contentId: id, platform: c.platform, event: "approved", status: "APPROVED", postId: null, url: null, error: null, detail: null });
    if (getSettings().publishingMode === "queue") queueApproved([id]);
    return c.id;
  });
}

/** APPROVE & POST — the user's explicit final action. */
export async function approveAndPostAction(id: string): Promise<ActionResult<PublishOutcome>> {
  return guard(async () => {
    const c = getContent(id);
    if (!c) throw new Error("Not found");
    if (c.status !== "APPROVED" || !c.approvedAt) {
      markApproved(id);
      logPublish({ contentId: id, platform: c.platform, event: "approved", status: "APPROVED", postId: null, url: null, error: null, detail: "approve & post" });
    }
    return publishContent(id, { trigger: "user" });
  });
}

export async function approveAndScheduleAction(id: string, local: string, timeZone: string, allowDuplicate = false) {
  return guard(() => {
    const at = zonedToUtc(local, timeZone);
    if (new Date(at).getTime() < Date.now() + 60_000) throw new Error("Choose a time in the future.");
    const c = getContent(id);
    if (!c) throw new Error("Not found");
    if (!c.duplicateOverride) {
      const dups = findDuplicates(c);
      if (dups.length && !allowDuplicate) return { duplicate: dups[0] };
      if (dups.length) setField(id, { duplicateOverride: true });
    }
    if (!["APPROVED", "SCHEDULED"].includes(c.status) || !c.approvedAt) markApproved(id);
    const s = setStatus(id, "SCHEDULED", { scheduledAt: at, timezone: timeZone, lastError: null });
    notify("scheduled", "Content scheduled", `${PLATFORM_LABEL[s.platform]}: ${s.title || s.hook} — ${local.replace("T", " ")} ${timeZone}`, `/library/${id}`);
    logPublish({ contentId: id, platform: s.platform, event: "scheduled", status: "SCHEDULED", postId: null, url: null, error: null, detail: `${local} ${timeZone}` });
    return { scheduled: s.id };
  });
}

export async function unscheduleAction(id: string) {
  return guard(() => setStatus(id, "APPROVED").id);
}

export async function publishNowAction(id: string) {
  return guard(() => publishContent(id, { trigger: "user" }));
}

export async function retryAction(id: string) {
  return guard(() => publishContent(id, { trigger: "retry" }));
}

export async function allowDuplicateAndPostAction(id: string) {
  return guard(async () => {
    setField(id, { duplicateOverride: true });
    return publishContent(id, { trigger: "user" });
  });
}

export async function cancelAction(id: string) {
  return guard(() => setStatus(id, "CANCELLED").id);
}

export async function restoreAction(id: string) {
  return guard(() => setStatus(id, "DRAFT", { approvedAt: null, approvedHash: null }).id);
}

export async function deleteContentAction(id: string) {
  return guard(() => {
    const c = getContent(id);
    if (c?.status === "PUBLISHED") throw new Error("Published content stays in history; cancel instead of deleting.");
    deleteContent(id);
  });
}

export async function bulkApproveAction(ids: string[]) {
  return guard(() => {
    let n = 0;
    for (const id of ids) {
      try {
        markApproved(id);
        n++;
      } catch {
        /* skip items that cannot be approved */
      }
    }
    if (getSettings().publishingMode === "queue") queueApproved(ids);
    notify("approved", "Content approved", `${n} posts approved.`, "/library?status=APPROVED");
    return n;
  });
}

export async function queueApprovedAction(ids?: string[]) {
  return guard(() => queueApproved(ids).length);
}

export async function publishAllApprovedAction() {
  return guard(async () => {
    const items = listContent({ status: ["APPROVED"], limit: 50 });
    const results = [];
    for (const it of items) results.push({ id: it.id, platform: it.platform, ...(await publishContent(it.id, { trigger: "bulk" })) });
    return results;
  });
}

export async function moveOnCalendarAction(id: string, day: string) {
  return guard(() => {
    const c = getContent(id);
    if (!c) throw new Error("Not found");
    if (["PUBLISHED", "PUBLISHING", "CANCELLED"].includes(c.status)) throw new Error(`Cannot move ${c.status} content.`);
    const s = getSettings();
    const tz = c.timezone || s.timezone;
    const time = c.scheduledAt ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(c.scheduledAt)) : s.postingTimes[0] ?? "10:00";
    const at = zonedToUtc(`${day}T${time}`, tz);
    if (c.status === "SCHEDULED" && new Date(at).getTime() < Date.now()) throw new Error("Cannot move a scheduled post into the past.");
    setField(id, { scheduledAt: at, timezone: tz });
    return at;
  });
}

export async function setDestinationAction(id: string, accountId: string, destinationId: string) {
  return guard(() => {
    const acc = getAccount(accountId);
    if (!acc || !acc.destinations.some((d) => d.id === destinationId)) throw new Error("Invalid destination.");
    return editContent(id, { accountId, destinationId }).status;
  });
}

export async function attachMediaAction(id: string, mediaIds: string[]) {
  return guard(async () => {
    const valid = mediaIds.filter((m) => getMedia(m));
    const c = editContent(id, { mediaIds: valid });
    setField(id, { quality: await qualityCheck(c, [], { checkLinks: false }) });
    return c.status;
  });
}

export async function recycleAction(id: string, targets: { platform: Platform; contentType: ContentType }[]) {
  return guard(async () => (await recycleItem(id, targets)).map((i) => i.id));
}

// ------------------------------- Media -------------------------------

export async function renameMediaAction(id: string, name: string, category?: string) {
  return guard(() => renameMedia(id, name, category));
}

export async function deleteMediaAction(id: string) {
  return guard(() => {
    const inUse = listContent({ status: ["APPROVED", "SCHEDULED", "PUBLISHING"], limit: 2000 }).some((c) => c.mediaIds.includes(id));
    if (inUse) throw new Error("This file is used by approved or scheduled content.");
    deleteMedia(id);
  });
}

// ------------------------------- Accounts -------------------------------

export async function testConnectionAction(id: string) {
  return guard(async () => {
    const acc = getAccount(id);
    if (!acc) throw new Error("Account not found");
    try {
      const msg = await adapter(acc.platform).test(acc, getSecrets(id));
      setAccountStatus(id, "connected", null);
      return msg;
    } catch (e) {
      const pe = e instanceof PlatformError ? e : null;
      setAccountStatus(id, pe?.status === 401 ? "expired" : "error", (e as Error).message);
      notify("account", `${PLATFORM_LABEL[acc.platform]} connection problem`, (e as Error).message, "/accounts");
      throw e;
    }
  });
}

export async function disconnectAction(id: string) {
  return guard(() => {
    const acc = getAccount(id);
    if (!acc) return;
    for (const c of listContent({ status: ["SCHEDULED"] }).filter((c) => c.accountId === id)) setStatus(c.id, "APPROVED", { accountId: null, destinationId: null });
    deleteAccount(id);
    notify("account", `${PLATFORM_LABEL[acc.platform]} disconnected`, acc.accountName, "/accounts");
  });
}

// ------------------------------- Notifications / analytics / chat -------------------------------

export async function markNotificationsReadAction() {
  return guard(() => markAllRead());
}

export async function syncMetricsAction() {
  return guard(() => syncMetrics());
}

export async function insightsAction(): Promise<ActionResult<Insights | null>> {
  return guard(async () => {
    const d = analyticsDataset();
    if (!d.rows) throw new Error("No analytics data yet. Publish content and sync metrics first.");
    if (!aiConfigured()) throw new Error("AI is not configured (ANTHROPIC_API_KEY).");
    const ins = await analyzePerformance(d.table);
    kvSet("insights", { at: new Date().toISOString(), ins });
    return ins;
  });
}

export async function createFromIdeaAction(topic: string, category: string, contentType: ContentType) {
  return guard(async () => {
    const items = await createNow({ topic, category, targets: targetsFor([], contentType), language: getProfile().preferredLanguage, instruction: "Based on analytics insights." });
    return items.map((i) => i.id);
  });
}

export async function sendChatAction(message: string): Promise<ActionResult<AgentReply>> {
  return guard(() => {
    if (!message.trim()) throw new Error("Type a message.");
    return handleChat(message.trim().slice(0, 4000));
  });
}

export async function clearChatAction() {
  return guard(() => clearChat());
}

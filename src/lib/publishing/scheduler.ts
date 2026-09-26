import "server-only";
import { contentHash, listContent, recordPublishResult, setField, setStatus } from "../repo/content";
import { getAccount, getSecrets, isConnected, listAccounts, setAccountStatus, updateSecrets } from "../repo/accounts";
import { isDueForScheduledPublish } from "../status";
import { publishContent } from "./publisher";
import { adapter } from "../platforms";
import { addDays, todayIn, zonedToUtc } from "../time";
import { PLATFORM_LABEL, type ContentItem } from "../types";
import { getSettings, kvGetDaily, logPublish, notify, saveMetrics } from "../repo/misc";

// Scheduler Agent. Runs every minute (in-process timer and/or the /api/cron/tick endpoint):
//   status == SCHEDULED (i.e. APPROVED + SCHEDULED) AND scheduled_time <= now AND account connected → publish

let running = false;

export async function schedulerTick(now = new Date()): Promise<{ published: number; failed: number; waiting: number }> {
  if (running) return { published: 0, failed: 0, waiting: 0 };
  running = true;
  let published = 0,
    failed = 0,
    waiting = 0;
  try {
    recoverStuck();
    const due = listContent({ status: ["SCHEDULED"], limit: 1000 }).filter((c) => c.scheduledAt && c.scheduledAt <= now.toISOString());
    for (const c of due) {
      const acc = c.accountId ? getAccount(c.accountId) : null;
      const connected = isConnected(acc) || Boolean(acc && acc.status === "connected" && adapter(acc.platform).refresh);
      const gateInput = { status: c.status, approvedAt: c.approvedAt, approvedHash: c.approvedHash, currentHash: contentHash(c), scheduledAt: c.scheduledAt };
      if (!isDueForScheduledPublish(gateInput, connected, now)) {
        if (!connected) {
          waiting++;
          const msg = `${PLATFORM_LABEL[c.platform]} account is not connected; scheduled post is waiting.`;
          if (c.lastError !== msg) {
            setField(c.id, { lastError: msg });
            notify("account", "Scheduled post waiting", `${c.title || c.hook}: ${msg}`, "/accounts");
          }
        }
        continue;
      }
      const r = await publishContent(c.id, { trigger: "scheduler" });
      if (r.ok) published++;
      else failed++;
    }
    await tokenHealth();
  } finally {
    running = false;
  }
  return { published, failed, waiting };
}

/** Items stuck in PUBLISHING (process crashed mid-publish) are marked failed — never assumed published. */
function recoverStuck() {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  for (const c of listContent({ status: ["PUBLISHING"] })) {
    if (c.updatedAt < cutoff) {
      recordPublishResult(c.id, { ok: false, error: "Publishing was interrupted; the outcome is unknown. Check the platform before retrying." });
      logPublish({ contentId: c.id, platform: c.platform, event: "recover", status: "FAILED", postId: null, url: null, error: "interrupted", detail: null });
    }
  }
}

/** Refresh tokens that are about to expire and warn about ones that need re-authorization. */
async function tokenHealth() {
  if (!kvGetDaily("token-health")) return;
  for (const a of listAccounts()) {
    if (!a.expiresAt || a.status === "disconnected") continue;
    const left = new Date(a.expiresAt).getTime() - Date.now();
    if (left > 3 * 86400_000) continue;
    const ad = adapter(a.platform);
    try {
      if (!ad.refresh) throw new Error("This platform requires re-authorization.");
      const r = await ad.refresh(getSecrets(a.id));
      updateSecrets(a.id, r.secrets, r.expiresAt);
    } catch (e) {
      if (left <= 0) setAccountStatus(a.id, "expired", (e as Error).message);
      notify("account", `${PLATFORM_LABEL[a.platform]} authorization needs renewal`, `${a.accountName}: ${left <= 0 ? "expired" : "expires within 3 days"}. Please reconnect.`, "/accounts");
    }
  }
}

/**
 * MODE 3 — Approved Content Queue: approved-but-unscheduled posts are placed into the
 * next free calendar slots (settings.postingTimes, max N per platform per day).
 * Items with a planned calendar date keep it if it is still in the future.
 */
export function queueApproved(ids?: string[]): ContentItem[] {
  const s = getSettings();
  const approved = listContent({ status: ["APPROVED"], limit: 1000 })
    .filter((c) => !ids || ids.includes(c.id))
    .sort((a, b) => (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt));
  const taken = new Map<string, number>(); // `${platform}|${date}` → count
  for (const c of listContent({ status: ["SCHEDULED", "PUBLISHED"], limit: 2000 })) {
    const at = c.scheduledAt ?? c.publishedAt;
    if (!at) continue;
    const k = `${c.platform}|${at.slice(0, 10)}`;
    taken.set(k, (taken.get(k) ?? 0) + 1);
  }
  const nowIso = new Date(Date.now() + 5 * 60_000).toISOString();
  const out: ContentItem[] = [];
  for (const c of approved) {
    let when: string | null = c.scheduledAt && c.scheduledAt > nowIso ? c.scheduledAt : null;
    if (!when) {
      let day = todayIn(s.timezone);
      for (let i = 0; i < 120 && !when; i++, day = addDays(day, 1)) {
        const k = `${c.platform}|${day}`;
        if ((taken.get(k) ?? 0) >= s.maxPostsPerDayPerPlatform) continue;
        for (const t of s.postingTimes) {
          const iso = zonedToUtc(`${day}T${t}`, s.timezone);
          if (iso > nowIso) {
            when = iso;
            break;
          }
        }
      }
    }
    if (!when) continue;
    const k = `${c.platform}|${when.slice(0, 10)}`;
    taken.set(k, (taken.get(k) ?? 0) + 1);
    out.push(setStatus(c.id, "SCHEDULED", { scheduledAt: when, timezone: s.timezone }));
    notify("scheduled", "Content scheduled", `${PLATFORM_LABEL[c.platform]}: ${c.title || c.hook}`, `/library/${c.id}`);
  }
  return out;
}

/** Pull real metrics from platform APIs for recently published posts. */
export async function syncMetrics(): Promise<number> {
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  let n = 0;
  for (const c of listContent({ status: ["PUBLISHED"], limit: 500 })) {
    if (!c.publishedAt || c.publishedAt < since || !c.accountId) continue;
    const acc = getAccount(c.accountId);
    if (!acc || !isConnected(acc)) continue;
    const ad = adapter(c.platform);
    if (!ad.metrics) continue;
    try {
      const m = await ad.metrics({ item: c, account: acc, secrets: getSecrets(acc.id) });
      if (m) {
        saveMetrics(c.id, c.platform, m);
        n++;
      }
    } catch {
      /* metrics are best-effort */
    }
  }
  if (n) notify("analytics", "Analytics updated", `Fetched metrics for ${n} published posts.`, "/analytics");
  return n;
}

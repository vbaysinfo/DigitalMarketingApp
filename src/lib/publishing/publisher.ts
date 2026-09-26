import "server-only";
import { claimForPublishing, contentHash, getContent, recordPublishResult, setField } from "../repo/content";
import { getAccount, getSecrets, isConnected, setAccountStatus, updateSecrets } from "../repo/accounts";
import { readMedia } from "../repo/media";
import { logPublish, notify } from "../repo/misc";
import { publishGate } from "../status";
import { composeCaption } from "../platform-rules";
import { adapter } from "../platforms";
import { PlatformError } from "../platforms/http";
import { appBaseUrl } from "../platforms/config";
import { hmac } from "../crypto";
import { findDuplicates, type DuplicateMatch } from "./duplicates";
import { qualityCheck } from "../quality";
import { PLATFORM_LABEL } from "../types";
import type { PublishMedia } from "../platforms/types";

// The publishing pipeline. Every path that publishes (APPROVE & POST, scheduler,
// "publish all approved", retry) goes through publishContent(), which enforces the
// approval gate on the server:
//
//   IF content.status != APPROVED → DO NOT PUBLISH
//   success confirmed by the platform → PUBLISHED, else → PUBLISH_FAILED

export type PublishOutcome =
  | { ok: true; postId: string; url: string | null }
  | { ok: false; stage: "gate" | "duplicate" | "validation" | "account" | "platform"; error: string; duplicates?: DuplicateMatch[] };

export function signedMediaUrl(id: string, jpeg = false, ttlSec = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const fmt = jpeg ? "jpg" : "orig";
  const sig = hmac(`${id}|${exp}|${fmt}`);
  return `${appBaseUrl()}/api/media/public/${id}?exp=${exp}&fmt=${fmt}&sig=${sig}`;
}

async function ensureFreshToken(accountId: string) {
  const account = getAccount(accountId)!;
  let secrets = getSecrets(accountId);
  const a = adapter(account.platform);
  const expiringSoon = account.expiresAt && new Date(account.expiresAt).getTime() - Date.now() < 5 * 60_000;
  if (expiringSoon && a.refresh) {
    const r = await a.refresh(secrets);
    updateSecrets(accountId, r.secrets, r.expiresAt);
    secrets = r.secrets;
  }
  return { account: getAccount(accountId)!, secrets };
}

export async function publishContent(
  id: string,
  opts: { trigger: "user" | "scheduler" | "bulk" | "retry" },
): Promise<PublishOutcome> {
  const item = getContent(id);
  if (!item) return { ok: false, stage: "gate", error: "Content not found." };
  const label = PLATFORM_LABEL[item.platform];

  // 1. Approval gate (backend-enforced).
  const gate = publishGate({ status: item.status, approvedAt: item.approvedAt, approvedHash: item.approvedHash, currentHash: contentHash(item) });
  if (!gate.ok) {
    logPublish({ contentId: id, platform: item.platform, event: "blocked", status: "BLOCKED", postId: null, url: null, error: gate.reason, detail: opts.trigger });
    return { ok: false, stage: "gate", error: gate.reason };
  }

  const fail = (stage: Exclude<PublishOutcome, { ok: true }>["stage"], error: string, extra: Partial<PublishOutcome> = {}): PublishOutcome => {
    // Scheduled/queued items that cannot be published become PUBLISH_FAILED so the user sees them;
    // direct user actions keep the status and simply show the error.
    if (opts.trigger === "scheduler" || opts.trigger === "bulk") {
      if (claimForPublishing(id, ["APPROVED", "SCHEDULED", "PUBLISH_FAILED"])) {
        recordPublishResult(id, { ok: false, error });
        notify("publish_failed", `${label} post failed`, `${item.title || item.hook}: ${error}`, `/library/${id}`);
      }
    } else {
      setField(id, { lastError: error });
    }
    logPublish({ contentId: id, platform: item.platform, event: "publish", status: "FAILED", postId: null, url: null, error, detail: stage });
    return { ok: false, stage, error, ...extra } as PublishOutcome;
  };

  // 2. Account connection + permissions.
  if (!item.accountId) return fail("account", `No ${label} account selected for this post.`);
  const acc = getAccount(item.accountId);
  if (!acc) return fail("account", `The selected ${label} account is no longer connected.`);
  if (acc.status !== "connected") return fail("account", `${label} account needs to be reconnected (${acc.status}).`);
  let account = acc;
  let secrets;
  try {
    ({ account, secrets } = await ensureFreshToken(acc.id));
  } catch (e) {
    setAccountStatus(acc.id, "expired", (e as Error).message);
    notify("account", `${label} authorization needs renewal`, (e as Error).message, "/accounts");
    return fail("account", `${label} authorization expired. Reconnect the account.`);
  }
  if (!isConnected(account)) return fail("account", `${label} authorization expired. Reconnect the account.`);
  const destination = account.destinations.find((d) => d.id === item.destinationId) ?? (account.destinations.length === 1 ? account.destinations[0] : null);
  if (!destination) return fail("account", `Choose where to post on ${label} (profile/page).`);

  // 3. Duplicate protection.
  if (!item.duplicateOverride) {
    const dups = findDuplicates(item);
    if (dups.length) return fail("duplicate", "SIMILAR CONTENT DETECTED", { duplicates: dups });
  }

  // 4. Content + media validation.
  const issues = await qualityCheck(item, [], { checkLinks: false });
  const blocking = issues.filter((i) => i.level === "error");
  if (blocking.length) return fail("validation", blocking.map((b) => b.message).join(" "));

  let media: PublishMedia[];
  try {
    media = item.mediaIds.map((mid) => {
      const { asset, data } = readMedia(mid);
      return { asset, data, publicUrl: (o?: { jpeg?: boolean }) => signedMediaUrl(mid, Boolean(o?.jpeg)) };
    });
  } catch (e) {
    return fail("validation", (e as Error).message);
  }

  // 5. Atomically claim → PUBLISHING (prevents double posting).
  if (!claimForPublishing(id, ["APPROVED", "SCHEDULED", "PUBLISH_FAILED"])) {
    return { ok: false, stage: "gate", error: "This post is already being published or its status changed." };
  }
  logPublish({ contentId: id, platform: item.platform, event: "publishing", status: "PUBLISHING", postId: null, url: null, error: null, detail: `${opts.trigger} → ${destination.name}` });

  // 6. Upload media + create the post via the official API; only a confirmed ID counts as success.
  const fresh = getContent(id)!;
  try {
    const res = await adapter(item.platform).publish({
      item: { ...fresh, destinationId: destination.id },
      caption: composeCaption(fresh),
      account,
      secrets,
      destination,
      media,
    });
    if (!res.postId) throw new PlatformError("Platform did not return a post ID.");
    recordPublishResult(id, { ok: true, postId: res.postId, url: res.url });
    logPublish({ contentId: id, platform: item.platform, event: "publish", status: "PUBLISHED", postId: res.postId, url: res.url, error: null, detail: res.detail ?? null });
    notify("published", `Published on ${label}`, `${fresh.title || fresh.hook}${res.detail ? ` — ${res.detail}` : ""}`, `/library/${id}`);
    return { ok: true, postId: res.postId, url: res.url };
  } catch (e) {
    const pe = e instanceof PlatformError ? e : null;
    const msg = pe ? `${pe.message}${pe.status ? ` (HTTP ${pe.status})` : ""}` : `Unexpected error: ${(e as Error).message}`;
    if (pe?.authProblem) {
      setAccountStatus(account.id, pe.status === 401 ? "expired" : "error", pe.message);
      notify("account", `${label} connection problem`, pe.message, "/accounts");
    }
    recordPublishResult(id, { ok: false, error: msg });
    logPublish({ contentId: id, platform: item.platform, event: "publish", status: "FAILED", postId: null, url: null, error: msg, detail: pe?.detail?.slice(0, 1500) ?? null });
    notify("publish_failed", `${label} post failed`, `${fresh.title || fresh.hook}: ${msg}`, `/library/${id}`);
    return { ok: false, stage: "platform", error: msg };
  }
}

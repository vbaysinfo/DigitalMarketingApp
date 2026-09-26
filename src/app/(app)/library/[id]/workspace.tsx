"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Info, Loader2, RefreshCw, Save, Send, Sparkles, Wand2, XCircle } from "lucide-react";
import {
  aiFixAction,
  approveAction,
  approveAndPostAction,
  approveAndScheduleAction,
  attachMediaAction,
  cancelAction,
  deleteContentAction,
  editContentAction,
  publishNowAction,
  recycleAction,
  regenerateAction,
  rerenderMediaAction,
  restoreAction,
  retryAction,
  runQualityCheckAction,
  setDestinationAction,
  submitForApprovalAction,
  unscheduleAction,
  allowDuplicateAndPostAction,
  type ActionResult,
} from "@/app/actions";
import type { PublishOutcome } from "@/lib/publishing/publisher";
import type { DuplicateMatch } from "@/lib/publishing/duplicates";
import { ActionButton } from "@/components/action-button";
import { MediaPicker } from "@/components/media-picker";
import { useToast } from "@/components/shell";
import { Card, btn, cx } from "@/components/ui";
import { PLATFORM_RULES } from "@/lib/platform-rules";
import { PLATFORMS, PLATFORM_LABEL, type ContentItem, type MediaAsset, type Platform, type SocialAccountPublic } from "@/lib/types";

function usePublishHandler() {
  const toast = useToast();
  const [dups, setDups] = useState<DuplicateMatch[] | null>(null);
  const handle = (r: ActionResult<PublishOutcome>) => {
    if (!r.ok) return; // toast already shown
    const o = r.data;
    if (!o) return;
    if (o.ok) toast("success", `🟢 Published! Post ID: ${o.postId}`);
    else if (o.stage === "duplicate") setDups(o.duplicates ?? []);
    else toast("error", o.error);
  };
  return { handle, dups, setDups };
}

// ============================================================ Approval panel

export function ApprovalPanel({
  item,
  accountConnected,
  hasAccount,
  destinationName,
  timezone,
  scheduledLocal,
  prefill,
  duplicates,
}: {
  item: ContentItem;
  accountConnected: boolean;
  hasAccount: boolean;
  destinationName: string | null;
  timezone: string;
  scheduledLocal: string | null;
  prefill: string | null;
  duplicates: DuplicateMatch[];
}) {
  const router = useRouter();
  const { handle, dups, setDups } = usePublishHandler();
  const [scheduling, setScheduling] = useState(Boolean(prefill));
  const [local, setLocal] = useState(() => prefill ?? new Date(Date.now() + 86400_000).toISOString().slice(0, 11) + "10:00");
  const [tz, setTz] = useState(timezone);
  const [instruction, setInstruction] = useState("");
  const s = item.status;
  const reviewable = ["DRAFT", "WAITING_FOR_APPROVAL", "APPROVED", "PUBLISH_FAILED"].includes(s);
  const hasErrors = item.quality.some((q) => q.level === "error");
  const connectedNote = !hasAccount ? (
    <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      No {PLATFORM_LABEL[item.platform]} account connected. <a className="underline" href="/accounts">Connect one</a> to publish.
    </p>
  ) : !accountConnected ? (
    <p className="rounded-lg bg-red-50 p-2 text-xs text-red-900 dark:bg-red-950 dark:text-red-200">
      The selected account needs to be reconnected. <a className="underline" href="/accounts">Social Accounts</a>
    </p>
  ) : destinationName ? (
    <p className="text-xs text-muted">
      Posting as <b className="text-text">{destinationName}</b>
    </p>
  ) : (
    <p className="text-xs text-amber-700 dark:text-amber-300">Choose a destination (profile/page) in the editor below.</p>
  );

  const tzs = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [timezone];

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-semibold">Review & approval</h3>
      <div className="space-y-3">
        {s === "GENERATING" && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> The AI agent is generating this content…
            <button className="underline" onClick={() => router.refresh()}>
              refresh
            </button>
          </p>
        )}

        {s === "PUBLISHED" && (
          <div className="space-y-2 rounded-xl bg-green-50 p-3 text-sm dark:bg-green-950/50">
            <p className="flex items-center gap-2 font-semibold text-green-800 dark:text-green-300">
              <CheckCircle2 size={18} /> 🟢 Published
            </p>
            <p className="break-all text-xs">Post ID: <code>{item.platformPostId}</code></p>
            <p className="text-xs">Published: {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : ""}</p>
            {item.publishedUrl && (
              <a href={item.publishedUrl} target="_blank" rel="noreferrer" className={btn("secondary", "sm")}>
                View post <ExternalLink size={14} />
              </a>
            )}
          </div>
        )}

        {s === "SCHEDULED" && (
          <div className="rounded-xl bg-indigo-50 p-3 text-sm dark:bg-indigo-950/50">
            <p className="flex items-center gap-2 font-semibold text-indigo-800 dark:text-indigo-300">
              <CalendarClock size={18} /> Approved + scheduled
            </p>
            <p className="mt-1 text-xs">
              {scheduledLocal} ({item.timezone || timezone})
            </p>
          </div>
        )}

        {s === "PUBLISH_FAILED" && (
          <div className="rounded-xl bg-red-50 p-3 text-sm dark:bg-red-950/50">
            <p className="flex items-center gap-2 font-semibold text-red-800 dark:text-red-300">
              <XCircle size={18} /> Publishing failed · {PLATFORM_LABEL[item.platform]}
            </p>
            <p className="mt-1 text-xs">{item.lastError}</p>
          </div>
        )}

        {item.lastError && s !== "PUBLISH_FAILED" && s !== "PUBLISHED" && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-300">{item.lastError}</p>}

        {duplicates.length > 0 && !item.duplicateOverride && s !== "PUBLISHED" && (
          <p className="flex gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle size={14} className="shrink-0" /> Similar content: {duplicates[0].reason}
          </p>
        )}

        {s !== "PUBLISHED" && s !== "CANCELLED" && connectedNote}

        {reviewable && (
          <>
            {s !== "APPROVED" && (
              <ActionButton
                variant="approve"
                size="lg"
                className="w-full"
                disabled={!accountConnected || hasErrors}
                title={hasErrors ? "Fix the quality errors first" : undefined}
                confirm={`Approve and publish this post to ${PLATFORM_LABEL[item.platform]}${destinationName ? ` (${destinationName})` : ""} now?`}
                action={() => (s === "PUBLISH_FAILED" ? retryAction(item.id) : approveAndPostAction(item.id))}
                onDone={handle}
              >
                <Send size={18} /> {s === "PUBLISH_FAILED" ? "RETRY" : "APPROVE & POST"}
              </ActionButton>
            )}
            {s === "APPROVED" && (
              <ActionButton
                variant="approve"
                size="lg"
                className="w-full"
                disabled={!accountConnected || hasErrors}
                confirm={`Publish this approved post to ${PLATFORM_LABEL[item.platform]} now?`}
                action={() => publishNowAction(item.id)}
                onDone={handle}
              >
                <Send size={18} /> POST NOW
              </ActionButton>
            )}
            <button className={`${btn("primary")} w-full`} onClick={() => setScheduling((x) => !x)} disabled={hasErrors}>
              <CalendarClock size={16} /> {s === "APPROVED" ? "SCHEDULE" : "APPROVE & SCHEDULE"}
            </button>
            {scheduling && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <label className="label">Date & time</label>
                <input type="datetime-local" className="input" value={local} onChange={(e) => setLocal(e.target.value)} />
                <label className="label">Time zone</label>
                <select className="input" value={tz} onChange={(e) => setTz(e.target.value)}>
                  {tzs.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
                <ActionButton
                  variant="primary"
                  className="w-full"
                  action={async () => {
                    const r = await approveAndScheduleAction(item.id, local, tz);
                    if (r.ok && r.data && "duplicate" in r.data) {
                      const d = r.data.duplicate ?? { reason: "Similar content", title: "" };
                      if (!window.confirm(`SIMILAR CONTENT DETECTED\n\n${d.reason}: "${d.title}"\n\nOK = schedule anyway · Cancel = go back and generate a new version`)) return { ok: false as const, error: "Not scheduled — similar content detected. Use REGENERATE for a new version." };
                      return approveAndScheduleAction(item.id, local, tz, true);
                    }
                    return r;
                  }}
                  success="Approved and scheduled"
                  onDone={(r) => r.ok && setScheduling(false)}
                >
                  Confirm schedule
                </ActionButton>
              </div>
            )}
            {s !== "APPROVED" && (
              <ActionButton className="w-full" action={() => approveAction(item.id)} success="Approved — it will only be posted when you choose Post now, a schedule, or the queue." disabled={hasErrors}>
                <CheckCircle2 size={16} /> Approve only
              </ActionButton>
            )}
            <div className="grid grid-cols-2 gap-2">
              <a href="#editor" className={btn("secondary", "sm")}>
                Edit
              </a>
              {s === "DRAFT" ? (
                <ActionButton size="sm" action={() => submitForApprovalAction(item.id)} success="Sent for approval">
                  Submit for approval
                </ActionButton>
              ) : (
                <ActionButton size="sm" variant="danger" confirm="Cancel this post?" action={() => cancelAction(item.id)}>
                  Cancel
                </ActionButton>
              )}
            </div>
            <div className="space-y-2 rounded-xl border border-border p-3">
              <label className="label">Regenerate with instructions</label>
              <input className="input" placeholder="e.g. make it shorter / more professional / translate to Telugu" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <div className="flex flex-wrap gap-1.5">
                {["Make it shorter", "More professional", "Translate to Telugu + English", "Another version"].map((p) => (
                  <button key={p} className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-surface-2" onClick={() => setInstruction(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <ActionButton size="sm" className="w-full" action={() => regenerateAction(item.id, instruction)} success="Regenerated — please review again">
                <RefreshCw size={14} /> REGENERATE
              </ActionButton>
            </div>
          </>
        )}

        {s === "SCHEDULED" && (
          <div className="grid gap-2">
            <ActionButton variant="approve" confirm="Publish this post now instead of waiting?" action={() => publishNowAction(item.id)} onDone={handle}>
              <Send size={16} /> POST NOW
            </ActionButton>
            <ActionButton action={() => unscheduleAction(item.id)} success="Unscheduled">
              Unschedule
            </ActionButton>
            <a href="#editor" className={btn("secondary", "sm")}>
              Edit (requires re-approval)
            </a>
          </div>
        )}

        {s === "CANCELLED" && (
          <div className="grid grid-cols-2 gap-2">
            <ActionButton size="sm" action={() => restoreAction(item.id)}>
              Restore as draft
            </ActionButton>
            <ActionButton size="sm" variant="danger" confirm="Delete permanently?" action={() => deleteContentAction(item.id)} onDone={(r) => r.ok && router.push("/library")}>
              Delete
            </ActionButton>
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-muted">Nothing is published until you approve it. Editing approved content sends it back for approval.</p>
      </div>

      {dups && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
            <p className="flex items-center gap-2 text-lg font-bold text-amber-600">
              <AlertTriangle /> SIMILAR CONTENT DETECTED
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {dups.slice(0, 4).map((d) => (
                <li key={d.id} className="rounded-lg bg-surface-2 p-2">
                  <a href={`/library/${d.id}`} className="font-medium underline">
                    {d.title}
                  </a>
                  <p className="text-xs text-muted">{d.reason}</p>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <ActionButton variant="primary" action={() => allowDuplicateAndPostAction(item.id)} onDone={(r) => { setDups(null); handle(r); }}>
                USE ANYWAY
              </ActionButton>
              <ActionButton action={() => regenerateAction(item.id, "Write a clearly different new version with a new angle, hook and wording.")} onDone={() => setDups(null)} success="New version generated — please review">
                GENERATE NEW VERSION
              </ActionButton>
            </div>
            <button className="mt-3 w-full text-sm text-muted underline" onClick={() => setDups(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================ Quality panel

export function QualityPanel({ item }: { item: ContentItem }) {
  const icon = { error: <XCircle size={14} className="shrink-0 text-danger" />, warning: <AlertTriangle size={14} className="shrink-0 text-amber-500" />, info: <Info size={14} className="shrink-0 text-muted" /> };
  const editable = !["PUBLISHED", "PUBLISHING", "CANCELLED", "GENERATING"].includes(item.status);
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Quality check</h3>
        {editable && (
          <ActionButton size="sm" variant="ghost" action={() => runQualityCheckAction(item.id)} success="Quality check updated">
            <RefreshCw size={12} /> Re-check
          </ActionButton>
        )}
      </div>
      {item.quality.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 size={16} /> No issues found
        </p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {item.quality.map((q, i) => (
            <li key={i} className="flex gap-2">
              {icon[q.level]} <span>{q.message}</span>
            </li>
          ))}
        </ul>
      )}
      {editable && item.quality.some((q) => q.level !== "info") && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ActionButton size="sm" variant="primary" action={() => aiFixAction(item.id)} success="AI fixed the issues — please review">
            <Wand2 size={14} /> AI FIX
          </ActionButton>
          <ActionButton size="sm" action={() => rerenderMediaAction(item.id)} success="Media re-generated">
            <Sparkles size={14} /> Re-render media
          </ActionButton>
        </div>
      )}
    </Card>
  );
}

// ============================================================ Editor

export function ContentEditor({ item, accounts, media, library }: { item: ContentItem; accounts: SocialAccountPublic[]; media: MediaAsset[]; library: MediaAsset[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    title: item.title,
    hook: item.hook,
    body: item.body,
    cta: item.cta,
    hashtags: item.hashtags.join(" "),
    link: item.link,
    keywords: item.keywords.join(", "),
  });
  const [mediaIds, setMediaIds] = useState(item.mediaIds);
  const editable = !["PUBLISHED", "PUBLISHING", "CANCELLED", "GENERATING"].includes(item.status);
  const rules = PLATFORM_RULES[item.platform];
  const dest = `${item.accountId ?? ""}|${item.destinationId ?? ""}`;
  const save = () =>
    start(async () => {
      const r = await editContentAction(item.id, {
        title: f.title,
        hook: f.hook,
        body: f.body,
        cta: f.cta,
        link: f.link.trim(),
        hashtags: f.hashtags.split(/[\s,]+/).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)),
        keywords: f.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      });
      if (!r.ok) toast("error", r.error);
      else toast("success", r.data?.revokedApproval ? "Saved. Approval was reset — please review and approve again." : "Draft saved");
      router.refresh();
    });
  const field = (k: keyof typeof f, label: string, rows = 0, hint?: string) => (
    <div>
      <label className="label">{label}</label>
      {rows ? (
        <textarea className="input" rows={rows} value={f[k]} disabled={!editable} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      ) : (
        <input className="input" value={f[k]} disabled={!editable} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      )}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
  return (
    <Card className="p-5" >
      <div id="editor" className="scroll-mt-20" />
      <h2 className="mb-4 font-semibold">Edit content</h2>
      <div className="grid gap-4">
        <div>
          <label className="label">Post to</label>
          <select
            className="input"
            value={dest}
            disabled={!editable || !accounts.length}
            onChange={(e) =>
              start(async () => {
                const [a, d] = e.target.value.split("|");
                const r = await setDestinationAction(item.id, a, d);
                if (!r.ok) toast("error", r.error);
                router.refresh();
              })
            }
          >
            <option value="|">{accounts.length ? "Choose profile / page…" : "No account connected"}</option>
            {accounts.flatMap((a) =>
              a.destinations.map((d) => (
                <option key={a.id + d.id} value={`${a.id}|${d.id}`}>
                  {d.name} · {d.type} ({a.accountName})
                </option>
              )),
            )}
          </select>
        </div>
        {field("title", item.platform === "youtube" || item.platform === "pinterest" ? "Title (search-optimised)" : "Title / internal name", 0, rules.titleMax ? `${f.title.length}/${rules.titleMax}` : undefined)}
        {field("hook", "Hook")}
        {field("body", item.platform === "youtube" ? "Description" : "Caption", 8, `${f.body.length} chars · ${item.platform} max ${rules.maxChars} incl. CTA & hashtags`)}
        {field("cta", "Call to action", 0, "Leave empty when a CTA doesn't fit.")}
        {field("hashtags", "Hashtags", 0, `Recommended ${rules.idealHashtags[0]}–${rules.idealHashtags[1]} · max ${rules.maxHashtags}`)}
        {(item.platform === "youtube" || item.platform === "pinterest") && field("keywords", item.platform === "youtube" ? "Tags (comma separated)" : "Keywords")}
        {field("link", "Link (optional)")}
        <div>
          <label className="label">Media</label>
          {editable ? (
            <>
              <MediaPicker library={library} value={mediaIds} onChange={setMediaIds} />
              {JSON.stringify(mediaIds) !== JSON.stringify(item.mediaIds) && (
                <ActionButton size="sm" className="mt-2" variant="primary" action={() => attachMediaAction(item.id, mediaIds)} success="Media updated">
                  Save media
                </ActionButton>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">{media.map((m) => m.name).join(", ") || "None"}</p>
          )}
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <button className={btn("primary")} onClick={save} disabled={pending}>
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} SAVE DRAFT
            </button>
            {["APPROVED", "SCHEDULED"].includes(item.status) && <p className="self-center text-xs text-amber-700 dark:text-amber-300">Changing approved content resets its approval.</p>}
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================ Recycle

export function RecyclePanel({ item }: { item: ContentItem }) {
  const router = useRouter();
  const [targets, setTargets] = useState<Platform[]>([]);
  if (item.status === "GENERATING") return null;
  const typeFor = (p: Platform) => (p === "youtube" || p === "tiktok" ? "short" : p === "instagram" ? "carousel" : p === "pinterest" ? "image" : item.contentType === "carousel" ? "carousel" : "image");
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">Content recycling</h3>
      <p className="mb-2 text-xs text-muted">Rewrite this post for other platforms and formats (never an exact copy).</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PLATFORMS.map((p) => (
          <button
            key={p}
            onClick={() => setTargets((t) => (t.includes(p) ? t.filter((x) => x !== p) : [...t, p]))}
            className={cx("rounded-full border px-2 py-0.5 text-xs", targets.includes(p) ? "border-primary bg-primary/10 text-primary" : "border-border")}
          >
            {PLATFORM_LABEL[p]}
          </button>
        ))}
      </div>
      <ActionButton
        size="sm"
        className="w-full"
        disabled={!targets.length}
        action={() => recycleAction(item.id, targets.map((p) => ({ platform: p, contentType: typeFor(p) })))}
        success={(ids) => `Created ${(ids as string[] | undefined)?.length ?? 0} new versions for review`}
        onDone={(r) => {
          const ids = r.ok ? (r.data as string[] | undefined) : undefined;
          if (ids?.[0]) router.push(`/library/${ids[0]}`);
        }}
      >
        <Sparkles size={14} /> Recycle
      </ActionButton>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Card, PlatformIcon, StatusBadge, cx } from "@/components/ui";
import { bulkApproveAction, publishAllApprovedAction, queueApprovedAction } from "@/app/actions";
import { CONTENT_TYPE_LABEL, type ContentItem, type PublishingMode } from "@/lib/types";

export function LibraryTable({ items, thumbs, timezone, mode }: { items: ContentItem[]; thumbs: Record<string, string | null>; timezone: string; mode: PublishingMode }) {
  const [sel, setSel] = useState<string[]>([]);
  const approvable = items.filter((i) => ["DRAFT", "WAITING_FOR_APPROVAL"].includes(i.status) && !i.quality.some((q) => q.level === "error"));
  const approved = items.filter((i) => i.status === "APPROVED");
  const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {approvable.length > 0 && (
          <button className="text-xs underline" onClick={() => setSel(sel.length ? [] : approvable.map((i) => i.id))}>
            {sel.length ? "Clear selection" : `Select all ${approvable.length} awaiting approval`}
          </button>
        )}
        {sel.length > 0 && (
          <ActionButton size="sm" variant="primary" action={() => bulkApproveAction(sel)} success={(n) => `${n} approved${mode === "queue" ? " and queued" : ""}`} onDone={() => setSel([])}>
            Approve {sel.length} selected
          </ActionButton>
        )}
        {approved.length > 0 && (
          <>
            <ActionButton size="sm" action={() => queueApprovedAction()} success={(n) => `${n} posts scheduled into the calendar`}>
              Queue {approved.length} approved into calendar
            </ActionButton>
            <ActionButton
              size="sm"
              variant="approve"
              confirm={`Publish all ${approved.length} approved posts now?`}
              action={() => publishAllApprovedAction()}
              success={(r) => {
                const list = (r as { ok: boolean }[] | undefined) ?? [];
                return `Published ${list.filter((x) => x.ok).length} of ${list.length}`;
              }}
            >
              Publish all approved
            </ActionButton>
          </>
        )}
      </div>
      <Card className="divide-y divide-border overflow-hidden">
        {items.map((i) => {
          const selectable = approvable.some((a) => a.id === i.id);
          return (
            <div key={i.id} className={cx("flex items-center gap-3 p-3 hover:bg-surface-2", sel.includes(i.id) && "bg-primary/5")}>
              <input
                type="checkbox"
                aria-label="Select"
                disabled={!selectable}
                checked={sel.includes(i.id)}
                onChange={() => setSel((s) => (s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id]))}
                className="h-4 w-4 shrink-0"
              />
              <Link href={`/library/${i.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {thumbs[i.id] ? <img src={`/api/media/${thumbs[i.id]}`} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center"><PlatformIcon platform={i.platform} /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.hook || i.title || i.topic}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <PlatformIcon platform={i.platform} size={14} /> {CONTENT_TYPE_LABEL[i.contentType]} · {i.category}
                    {i.scheduledAt && <span>· {i.status === "SCHEDULED" ? "⏰" : "📅"} {fmt(i.scheduledAt)}</span>}
                    {i.publishedAt && <span>· published {fmt(i.publishedAt)}</span>}
                  </p>
                </div>
                <StatusBadge status={i.status} className="shrink-0" />
              </Link>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

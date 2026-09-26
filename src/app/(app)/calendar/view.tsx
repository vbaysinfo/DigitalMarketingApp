"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveOnCalendarAction } from "@/app/actions";
import { useToast } from "@/components/shell";
import { Card, PlatformIcon, StatusBadge, cx } from "@/components/ui";
import { CONTENT_TYPE_LABEL, PLATFORM_LABEL, type ContentStatus, type ContentType, type Platform } from "@/lib/types";

export type CalItem = {
  id: string;
  day: string;
  time: string;
  platform: Platform;
  contentType: ContentType;
  title: string;
  topic: string;
  category: string;
  status: ContentStatus;
  planned: boolean;
  thumb: string | null;
};

const BORDER: Partial<Record<ContentStatus, string>> = {
  DRAFT: "border-l-slate-400",
  WAITING_FOR_APPROVAL: "border-l-amber-500",
  APPROVED: "border-l-sky-500",
  SCHEDULED: "border-l-indigo-500",
  PUBLISHED: "border-l-green-500",
  PUBLISH_FAILED: "border-l-red-500",
  GENERATING: "border-l-violet-500",
  PUBLISHING: "border-l-cyan-500",
};

export function CalendarView({ month, today, items }: { month: string; today: string; items: CalItem[] }) {
  const [view, setView] = useState<"month" | "list">("month");
  const [dragging, setDragging] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const days: string[] = [];
  for (let i = -offset; i < 42 - offset; i++) days.push(new Date(Date.UTC(y, m - 1, 1 + i)).toISOString().slice(0, 10));
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it].sort((a, b) => a.time.localeCompare(b.time)));
  const move = (id: string, day: string) =>
    start(async () => {
      const r = await moveOnCalendarAction(id, day);
      if (!r.ok) toast("error", r.error);
      router.refresh();
    });
  const monthItems = items.filter((i) => i.day.startsWith(month)).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));

  return (
    <div>
      <div className="mb-3 flex gap-1">
        {(["month", "list"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={cx("rounded-lg px-3 py-1 text-sm", view === v ? "bg-primary/10 font-semibold text-primary" : "text-muted")}>
            {v === "month" ? "Month" : "List"}
          </button>
        ))}
      </div>
      {view === "list" ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase text-muted">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Time</th>
                <th className="p-3">Platform</th>
                <th className="p-3">Content</th>
                <th className="p-3">Topic</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {monthItems.map((i) => (
                <tr key={i.id} className="hover:bg-surface-2">
                  <td className="p-3 whitespace-nowrap">{new Date(i.day + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</td>
                  <td className="p-3">{i.time}</td>
                  <td className="p-3">
                    <span className="flex items-center gap-2 whitespace-nowrap"><PlatformIcon platform={i.platform} size={16} /> {PLATFORM_LABEL[i.platform]}</span>
                  </td>
                  <td className="p-3 whitespace-nowrap">{i.category} {CONTENT_TYPE_LABEL[i.contentType]}</td>
                  <td className="max-w-xs truncate p-3">
                    <Link href={`/library/${i.id}`} className="hover:underline">{i.title}</Link>
                  </td>
                  <td className="p-3"><StatusBadge status={i.status} /></td>
                </tr>
              ))}
              {!monthItems.length && (
                <tr><td colSpan={6} className="p-6 text-center text-muted">Nothing planned this month.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border bg-border">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="bg-surface-2 p-2 text-center text-xs font-semibold text-muted">{d}</div>
            ))}
            {days.map((d) => {
              const inMonth = d.startsWith(month);
              const list = byDay.get(d) ?? [];
              return (
                <div
                  key={d}
                  onDragOver={(e) => dragging && e.preventDefault()}
                  onDrop={() => {
                    if (dragging) move(dragging, d);
                    setDragging(null);
                  }}
                  className={cx("min-h-28 bg-surface p-1.5", !inMonth && "bg-surface-2/60 opacity-60", d === today && "ring-2 ring-inset ring-primary")}
                >
                  <p className={cx("mb-1 text-right text-xs", d === today ? "font-bold text-primary" : "text-muted")}>{Number(d.slice(8))}</p>
                  <div className="space-y-1">
                    {list.slice(0, 4).map((i) => (
                      <Link
                        key={i.id}
                        href={`/library/${i.id}`}
                        draggable={!["PUBLISHED", "PUBLISHING"].includes(i.status)}
                        onDragStart={() => setDragging(i.id)}
                        className={cx("group block rounded-md border border-l-4 border-border bg-surface-2 px-1.5 py-1 text-[11px] hover:shadow", BORDER[i.status])}
                        title={`${PLATFORM_LABEL[i.platform]} · ${CONTENT_TYPE_LABEL[i.contentType]} · ${i.status}\n${i.title}`}
                      >
                        <span className="flex items-center gap-1">
                          <PlatformIcon platform={i.platform} size={14} />
                          <span className="text-muted">{i.time}</span>
                          <span className="ml-auto text-[9px] uppercase text-muted">{i.status === "WAITING_FOR_APPROVAL" ? "review" : i.status.toLowerCase().replace("_", " ")}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 leading-tight">{i.title}</span>
                      </Link>
                    ))}
                    {list.length > 4 && <p className="text-center text-[10px] text-muted">+{list.length - 4} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        {(["WAITING_FOR_APPROVAL", "APPROVED", "SCHEDULED", "PUBLISHED", "PUBLISH_FAILED", "DRAFT"] as ContentStatus[]).map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </div>
    </div>
  );
}

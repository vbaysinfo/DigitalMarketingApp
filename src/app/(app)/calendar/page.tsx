import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { listContent } from "@/lib/repo/content";
import { getMedia } from "@/lib/repo/media";
import { getProfile, getSettings } from "@/lib/repo/misc";
import { PageHeader, btn } from "@/components/ui";
import { CalendarView, type CalItem } from "./view";
import { PlanButtons } from "../plan-buttons";
import { todayIn, utcToZoned } from "@/lib/time";

export const metadata = { title: "Content Calendar" };

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const sp = await props.searchParams;
  const s = getSettings();
  const today = todayIn(s.timezone);
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  // Range padded by a week on both sides to cover time-zone shifts and the grid edges.
  const from = new Date(first.getTime() - 8 * 86400_000).toISOString();
  const to = new Date(Date.UTC(y, m, 1) + 8 * 86400_000).toISOString();
  const items: CalItem[] = listContent({ from, to, limit: 2000 })
    .filter((c) => c.status !== "CANCELLED")
    .map((c) => {
      const at = c.publishedAt ?? c.scheduledAt ?? c.createdAt;
      const local = utcToZoned(at, c.timezone || s.timezone);
      return {
        id: c.id,
        day: local.slice(0, 10),
        time: local.slice(11, 16),
        platform: c.platform,
        contentType: c.contentType,
        title: c.hook || c.title || c.topic,
        topic: c.topic,
        category: c.category,
        status: c.status,
        planned: !c.publishedAt && c.status !== "SCHEDULED",
        thumb: c.mediaIds.map(getMedia).find((x) => x?.mime.startsWith("image/"))?.id ?? c.video?.thumbnailMediaId ?? null,
      };
    });
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const p = getProfile();
  return (
    <div>
      <PageHeader
        title="Content Calendar"
        subtitle={`Times shown in ${s.timezone}. Drag a post to another day to move it.`}
        actions={<PlanButtons platforms={p.preferredPlatforms} language={p.preferredLanguage} />}
      />
      <div className="mb-4 flex items-center gap-2">
        <Link href={`/calendar?m=${prev}`} className={btn("secondary", "sm")} aria-label="Previous month">
          <ChevronLeft size={16} />
        </Link>
        <h2 className="min-w-40 text-center font-semibold">{monthLabel}</h2>
        <Link href={`/calendar?m=${next}`} className={btn("secondary", "sm")} aria-label="Next month">
          <ChevronRight size={16} />
        </Link>
        <Link href="/calendar" className={btn("ghost", "sm")}>
          Today
        </Link>
      </div>
      <CalendarView month={month} today={today} items={items} />
    </div>
  );
}

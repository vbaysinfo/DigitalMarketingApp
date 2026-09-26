import Link from "next/link";
import { analyticsSummary } from "@/lib/analytics";
import { kvGet } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/client";
import { Card, Empty, PageHeader, PlatformChip, Stat } from "@/components/ui";
import { AnalyticsActions, Insights } from "./client";
import { PLATFORM_LABEL, type Platform } from "@/lib/types";
import type { Insights as InsightsT } from "@/lib/ai/agents";

export const metadata = { title: "Analytics" };

function Bars({ rows, label }: { rows: { key: string; posts: number; avgEngagement: number }[]; label: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.avgEngagement));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} title={`${label(r.key)}: avg engagement ${r.avgEngagement.toFixed(1)} across ${r.posts} posts`}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-medium">{label(r.key)}</span>
            <span className="text-muted">
              {r.avgEngagement.toFixed(1)} avg · {r.posts} posts
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (r.avgEngagement / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function AnalyticsPage() {
  const a = analyticsSummary();
  const saved = kvGet<{ at: string; ins: InsightsT } | null>("insights", null);
  const t = a.totals;
  const fmt = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString());
  const maxTrend = Math.max(1, ...a.trend.map((x) => x.engagement));
  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="Real metrics fetched from each platform's API. Nothing is estimated." actions={<AnalyticsActions />} />
      {a.measured === 0 ? (
        <Empty title="No analytics yet">
          Publish content and click <b>Sync metrics</b>. Available metrics depend on each platform&apos;s API permissions (e.g. LinkedIn Company Page statistics need <code>r_organization_social</code>).
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Impressions" value={fmt(t.impressions)} />
            <Stat label="Reach" value={fmt(t.reach)} />
            <Stat label="Views" value={fmt((t.views ?? 0) + (t.videoViews ?? 0) || undefined)} />
            <Stat label="Likes" value={fmt(t.likes)} />
            <Stat label="Comments" value={fmt(t.comments)} />
            <Stat label="Shares" value={fmt(t.shares)} />
            <Stat label="Saves" value={fmt(t.saves)} />
            <Stat label="Clicks" value={fmt(t.clicks)} />
            <Stat label="Engagement" value={fmt(a.totalEngagement)} hint={`${a.measured} posts measured`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Platform performance</h2>
              <Bars rows={a.byPlatform} label={(k) => PLATFORM_LABEL[k as Platform] ?? k} />
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Best content topics / categories</h2>
              <Bars rows={a.byCategory} label={(k) => k} />
            </Card>
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Formats</h2>
              <Bars rows={a.byType} label={(k) => k} />
            </Card>
          </div>
          {a.trend.length > 1 && (
            <Card className="p-5">
              <h2 className="mb-1 font-semibold">Engagement trend</h2>
              <p className="mb-3 text-xs text-muted">New engagement recorded per sync day</p>
              <div className="flex h-32 items-end gap-1">
                {a.trend.map((d) => (
                  <div key={d.day} className="group relative flex-1" title={`${d.day}: +${d.engagement}`}>
                    <div className="rounded-t-[4px] bg-primary/80 group-hover:bg-primary" style={{ height: `${Math.max(2, (d.engagement / maxTrend) * 120)}px` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted">
                <span>{a.trend[0].day}</span>
                <span>{a.trend[a.trend.length - 1].day}</span>
              </div>
            </Card>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              { title: "Top-performing posts", rows: a.topPosts, metric: (r: (typeof a.topPosts)[0]) => `${r.engagement} engagements` },
              { title: "Top-performing videos", rows: a.topVideos, metric: (r: (typeof a.topPosts)[0]) => `${(r.data.videoViews ?? r.data.views ?? 0).toLocaleString()} views` },
            ].map((sec) => (
              <Card key={sec.title} className="p-5">
                <h2 className="mb-3 font-semibold">{sec.title}</h2>
                {sec.rows.length ? (
                  <ol className="space-y-2">
                    {sec.rows.map((r) => (
                      <li key={r.item.id} className="flex items-center gap-2 text-sm">
                        <PlatformChip platform={r.item.platform} />
                        <Link href={`/library/${r.item.id}`} className="min-w-0 flex-1 truncate hover:underline">
                          {r.item.hook || r.item.title}
                        </Link>
                        <span className="text-xs text-muted">{sec.metric(r)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted">No data.</p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
      <Insights initial={saved?.ins ?? null} at={saved?.at ?? null} enabled={aiConfigured() && a.measured > 0} />
    </div>
  );
}

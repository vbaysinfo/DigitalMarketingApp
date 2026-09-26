import "server-only";
import { latestMetrics, metricsHistory } from "./repo/misc";
import { listContent } from "./repo/content";
import type { ContentItem, Platform } from "./types";

// Aggregations over REAL metrics fetched from platform APIs. Nothing is estimated
// or invented: posts without fetched metrics are simply not counted.

export const METRIC_KEYS = ["views", "videoViews", "reach", "impressions", "likes", "comments", "shares", "saves", "clicks", "followers", "watchTimeSec"] as const;

export function engagementOf(d: Record<string, number>): number {
  return (d.likes ?? 0) + (d.comments ?? 0) + (d.shares ?? 0) + (d.saves ?? 0) + (d.clicks ?? 0);
}

export type Row = { item: ContentItem; data: Record<string, number>; engagement: number; fetchedAt: string };

export function analyticsRows(): Row[] {
  const items = new Map(listContent({ status: ["PUBLISHED"], limit: 2000 }).map((c) => [c.id, c]));
  return latestMetrics()
    .filter((m) => items.has(m.contentId))
    .map((m) => ({ item: items.get(m.contentId)!, data: m.data, engagement: engagementOf(m.data), fetchedAt: m.fetchedAt }));
}

function group(rows: Row[], key: (r: Row) => string) {
  const map = new Map<string, { posts: number; engagement: number; reach: number; impressions: number; views: number }>();
  for (const r of rows) {
    const k = key(r);
    const g = map.get(k) ?? { posts: 0, engagement: 0, reach: 0, impressions: 0, views: 0 };
    g.posts++;
    g.engagement += r.engagement;
    g.reach += r.data.reach ?? 0;
    g.impressions += r.data.impressions ?? 0;
    g.views += (r.data.views ?? 0) + (r.data.videoViews ?? 0);
    map.set(k, g);
  }
  return [...map.entries()].map(([k, v]) => ({ key: k, ...v, avgEngagement: v.posts ? v.engagement / v.posts : 0 })).sort((a, b) => b.avgEngagement - a.avgEngagement);
}

export function analyticsSummary() {
  const rows = analyticsRows();
  const totals: Record<string, number> = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.data)) totals[k] = (totals[k] ?? 0) + (typeof v === "number" ? v : 0);
  const history = metricsHistory();
  const byDay = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const h of history) {
    // engagement gained per day = delta from previous snapshot of that post
    const e = engagementOf(h.data);
    const prev = seen.get(h.contentId) ?? 0;
    seen.set(h.contentId, e);
    const day = h.fetchedAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Math.max(0, e - prev));
  }
  return {
    rows,
    measured: rows.length,
    totals,
    totalEngagement: rows.reduce((a, r) => a + r.engagement, 0),
    byPlatform: group(rows, (r) => r.item.platform),
    byCategory: group(rows, (r) => r.item.category || "Uncategorised"),
    byType: group(rows, (r) => r.item.contentType),
    topPosts: [...rows].sort((a, b) => b.engagement - a.engagement).slice(0, 5),
    topVideos: rows
      .filter((r) => ["reel", "short", "video"].includes(r.item.contentType) && (r.data.videoViews !== undefined || r.data.views !== undefined))
      .sort((a, b) => (b.data.videoViews ?? b.data.views ?? 0) - (a.data.videoViews ?? a.data.views ?? 0))
      .slice(0, 5),
    trend: [...byDay.entries()].sort().map(([day, engagement]) => ({ day, engagement })),
  };
}

export function analyticsDataset(): { rows: number; table: string } {
  const rows = analyticsRows();
  const header = "platform | type | category | topic | published | metrics";
  const lines = rows.map(
    (r) =>
      `${r.item.platform} | ${r.item.contentType} | ${r.item.category} | ${r.item.topic.slice(0, 80)} | ${r.item.publishedAt?.slice(0, 10)} | ${Object.entries(r.data)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ")}`,
  );
  return { rows: rows.length, table: [header, ...lines].join("\n") };
}

export function platformOf(r: Row): Platform {
  return r.item.platform;
}

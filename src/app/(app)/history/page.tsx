import Link from "next/link";
import { listContent } from "@/lib/repo/content";
import { getSettings, listLog } from "@/lib/repo/misc";
import { Card, Empty, PageHeader, PlatformChip, StatusBadge } from "@/components/ui";
import { formatLocal } from "@/lib/time";
import { RetryButtons } from "./retry";
import { PLATFORMS, PLATFORM_LABEL, type Platform } from "@/lib/types";

export const metadata = { title: "Publishing History" };

export default async function HistoryPage(props: PageProps<"/history">) {
  const sp = await props.searchParams;
  const platform = typeof sp.platform === "string" && (PLATFORMS as readonly string[]).includes(sp.platform) ? (sp.platform as Platform) : undefined;
  const tz = getSettings().timezone;
  const items = listContent({ status: ["PUBLISHED", "PUBLISH_FAILED", "PUBLISHING"], platform, limit: 500 }).sort((a, b) =>
    (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt),
  );
  const log = listLog({ limit: 60 });
  return (
    <div className="space-y-8">
      <PageHeader title="Publishing History" subtitle="Only posts confirmed by the platform are marked Published." />
      <form className="flex gap-2" action="/history">
        <select name="platform" defaultValue={platform ?? ""} className="input w-auto">
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </select>
        <button className="rounded-lg border border-border px-3 text-sm">Filter</button>
      </form>
      {items.length === 0 ? (
        <Empty title="Nothing published yet">Approved posts appear here once the platform confirms them.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase text-muted">
              <tr>
                <th className="p-3">Platform</th>
                <th className="p-3">Post</th>
                <th className="p-3">Date & time</th>
                <th className="p-3">Status</th>
                <th className="p-3">Post ID / URL</th>
                <th className="p-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((i) => (
                <tr key={i.id} className="align-top hover:bg-surface-2">
                  <td className="p-3"><PlatformChip platform={i.platform} /></td>
                  <td className="max-w-xs p-3">
                    <Link href={`/library/${i.id}`} className="line-clamp-2 hover:underline">{i.hook || i.title}</Link>
                  </td>
                  <td className="whitespace-nowrap p-3 text-xs">{formatLocal(i.publishedAt ?? i.updatedAt, tz)}</td>
                  <td className="p-3"><StatusBadge status={i.status} /></td>
                  <td className="max-w-[220px] p-3 text-xs">
                    {i.platformPostId && <code className="block break-all">{i.platformPostId}</code>}
                    {i.publishedUrl && <a href={i.publishedUrl} target="_blank" rel="noreferrer" className="text-primary underline">Open</a>}
                  </td>
                  <td className="max-w-xs p-3 text-xs text-danger">
                    {i.status === "PUBLISH_FAILED" && (
                      <>
                        <p>{i.lastError}</p>
                        <RetryButtons id={i.id} />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Publishing event log</h2>
        <Card className="divide-y divide-border text-xs">
          {log.map((l) => (
            <div key={l.id} className="flex flex-wrap gap-x-3 p-2.5">
              <span className="text-muted">{formatLocal(l.createdAt, tz)}</span>
              <span className="font-medium">{PLATFORM_LABEL[l.platform]}</span>
              <span>{l.event}</span>
              <span className={l.status === "FAILED" || l.status === "BLOCKED" ? "text-danger" : l.status === "PUBLISHED" ? "text-green-600" : ""}>{l.status}</span>
              {l.error && <span className="text-danger">{l.error}</span>}
              <Link className="ml-auto underline" href={`/library/${l.contentId}`}>content</Link>
            </div>
          ))}
          {!log.length && <p className="p-3 text-muted">No events yet.</p>}
        </Card>
      </section>
    </div>
  );
}

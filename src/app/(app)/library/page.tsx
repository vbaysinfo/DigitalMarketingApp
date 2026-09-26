import Link from "next/link";
import { listContent, statusCounts } from "@/lib/repo/content";
import { getMedia } from "@/lib/repo/media";
import { getSettings } from "@/lib/repo/misc";
import { Empty, PageHeader, btn, cx } from "@/components/ui";
import { LibraryTable } from "./table";
import { CONTENT_STATUSES, PLATFORMS, PLATFORM_LABEL, STATUS_LABEL, type ContentStatus, type Platform } from "@/lib/types";

export const metadata = { title: "Content Library" };

export default async function LibraryPage(props: PageProps<"/library">) {
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && (CONTENT_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as ContentStatus) : undefined;
  const platform = typeof sp.platform === "string" && (PLATFORMS as readonly string[]).includes(sp.platform) ? (sp.platform as Platform) : undefined;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const items = listContent({ status: status ? [status] : undefined, platform, q, limit: 300 });
  const counts = statusCounts();
  const s = getSettings();
  const thumbs: Record<string, string | null> = {};
  for (const it of items) {
    const m = it.mediaIds.map(getMedia).find((x) => x?.mime.startsWith("image/"));
    thumbs[it.id] = m ? m.id : (it.video?.thumbnailMediaId ?? null);
  }
  const link = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { status, platform, q, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/library?${u}`;
  };
  return (
    <div>
      <PageHeader
        title="Content Library"
        subtitle="Every idea, draft, approval and published post in one place."
        actions={
          <Link href="/create" className={btn("primary")}>
            Create content
          </Link>
        }
      />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Link href={link({ status: undefined })} className={cx("rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap", !status ? "border-primary bg-primary/10 text-primary" : "border-border")}>
          All
        </Link>
        {CONTENT_STATUSES.filter((x) => x !== "IDEA").map((x) => (
          <Link key={x} href={link({ status: x })} className={cx("rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap", status === x ? "border-primary bg-primary/10 text-primary" : "border-border")}>
            {STATUS_LABEL[x]} {counts[x] ? <span className="text-muted">({counts[x]})</span> : null}
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap gap-2" action="/library">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Search topic or caption…" className="input max-w-xs" />
        <select name="platform" defaultValue={platform ?? ""} className="input w-auto">
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </select>
        <button className={btn("secondary")}>Filter</button>
      </form>
      {items.length ? (
        <LibraryTable items={items} thumbs={thumbs} timezone={s.timezone} mode={s.publishingMode} />
      ) : (
        <Empty title="No content here yet">
          <Link className="underline" href="/agent">
            Ask the AI agent
          </Link>{" "}
          or{" "}
          <Link className="underline" href="/create">
            create a post
          </Link>
          .
        </Empty>
      )}
    </div>
  );
}

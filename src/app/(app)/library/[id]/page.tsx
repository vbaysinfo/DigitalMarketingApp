import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getContent, listContent } from "@/lib/repo/content";
import { accountsForPlatform } from "@/lib/repo/accounts";
import { getMedia, listMedia } from "@/lib/repo/media";
import { getProfile, getSettings, listLog } from "@/lib/repo/misc";
import { findDuplicates } from "@/lib/publishing/duplicates";
import { PostPreview } from "@/components/preview";
import { Card, PlatformChip, StatusBadge } from "@/components/ui";
import { ApprovalPanel, ContentEditor, QualityPanel, RecyclePanel } from "./workspace";
import { formatLocal } from "@/lib/time";
import { CONTENT_TYPE_LABEL, PLATFORM_LABEL, type MediaAsset } from "@/lib/types";

export default async function ContentPage(props: PageProps<"/library/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const item = getContent(id);
  if (!item) notFound();
  const settings = getSettings();
  const profile = getProfile();
  const accounts = accountsForPlatform(item.platform);
  const account = accounts.find((a) => a.id === item.accountId) ?? null;
  const destination = account?.destinations.find((d) => d.id === item.destinationId) ?? null;
  const media = item.mediaIds.map(getMedia).filter((m): m is MediaAsset => m !== null);
  const siblings = item.groupId ? listContent({ groupId: item.groupId }).filter((c) => c.id !== item.id) : [];
  const log = listLog({ contentId: id });
  const dups = ["PUBLISHED", "CANCELLED"].includes(item.status) ? [] : findDuplicates(item);
  const tz = item.timezone || settings.timezone;
  const prefill = typeof sp.schedule === "string" ? sp.schedule : null;

  return (
    <div>
      <Link href="/library" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={16} /> Content Library
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <PlatformChip platform={item.platform} />
        <span className="text-sm text-muted">{CONTENT_TYPE_LABEL[item.contentType]} · {item.category}</span>
        <StatusBadge status={item.status} />
        {item.generator === "template" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">Template draft</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Preview</h2>
            <div className="mx-auto max-w-xl">
              <PostPreview item={item} media={media} destination={destination} businessName={profile.businessName} />
            </div>
          </section>

          {(item.carousel.length > 0 || item.video) && (
            <Card className="p-5">
              {item.carousel.length > 0 && (
                <>
                  <h3 className="mb-3 font-semibold">Carousel slides</h3>
                  <ol className="grid gap-3 sm:grid-cols-2">
                    {item.carousel.map((s, i) => (
                      <li key={i} className="rounded-xl border border-border p-3">
                        <p className="text-xs font-semibold text-muted">Slide {i + 1}</p>
                        <p className="font-semibold">{s.heading}</p>
                        <p className="text-sm">{s.body}</p>
                        <p className="mt-1 text-xs italic text-muted">Design: {s.design}</p>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {item.video && (
                <>
                  <h3 className="mb-1 font-semibold">Video plan · {item.video.style}</h3>
                  <p className="mb-3 text-sm text-muted">{item.video.idea}</p>
                  <ol className="space-y-2">
                    {item.video.scenes.map((s, i) => (
                      <li key={i} className="rounded-xl border border-border p-3 text-sm">
                        <p className="text-xs font-semibold text-muted">
                          Scene {i + 1} · {s.label} · {s.durationSec}s
                        </p>
                        <p><b>On screen:</b> {s.onScreenText}</p>
                        <p><b>Voice-over:</b> {s.voiceOver}</p>
                        <p className="text-muted"><b>Visual:</b> {s.visual}</p>
                      </li>
                    ))}
                  </ol>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium">Script, subtitles & thumbnail</summary>
                    <p className="mt-2 whitespace-pre-wrap">{item.video.script}</p>
                    <p className="mt-2 whitespace-pre-wrap text-muted">{item.video.subtitles}</p>
                    <p className="mt-2"><b>Thumbnail:</b> {item.video.thumbnailConcept}</p>
                    {item.video.thumbnailMediaId && <img src={`/api/media/${item.video.thumbnailMediaId}`} alt="Thumbnail" className="mt-2 max-h-60 rounded-lg" />}
                  </details>
                </>
              )}
            </Card>
          )}

          {item.imagePrompt && (
            <Card className="p-5 text-sm">
              <h3 className="mb-1 font-semibold">Image concept</h3>
              <p>{item.imageConcept}</p>
              <p className="mt-2 text-xs text-muted">Prompt: {item.imagePrompt}</p>
            </Card>
          )}

          <ContentEditor item={item} accounts={accounts} media={media} library={listMedia()} />
        </div>

        <aside className="space-y-4">
          <ApprovalPanel
            item={item}
            accountConnected={Boolean(account && account.status === "connected")}
            hasAccount={accounts.length > 0}
            destinationName={destination?.name ?? null}
            timezone={tz}
            scheduledLocal={item.scheduledAt ? formatLocal(item.scheduledAt, tz) : null}
            prefill={prefill}
            duplicates={dups}
          />
          <QualityPanel item={item} />
          {siblings.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Other platform versions</h3>
              <ul className="space-y-2">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link href={`/library/${s.id}`} className="flex items-center justify-between gap-2 rounded-lg p-2 hover:bg-surface-2">
                      <PlatformChip platform={s.platform} />
                      <StatusBadge status={s.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <RecyclePanel item={item} />
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Activity</h3>
            {log.length === 0 ? (
              <p className="text-xs text-muted">No publishing activity yet.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {log.map((l) => (
                  <li key={l.id} className="border-l-2 border-border pl-2">
                    <p className="font-medium">
                      {l.event} · {l.status}
                    </p>
                    <p className="text-muted">{formatLocal(l.createdAt, tz)}</p>
                    {l.error && <p className="text-danger">{l.error}</p>}
                    {l.postId && <p className="break-all text-muted">ID: {l.postId}</p>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-muted">
              Created {formatLocal(item.createdAt, tz)} · {PLATFORM_LABEL[item.platform]}
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

import { FileText, Globe, Heart, MessageCircle, Repeat2, Send, ThumbsUp } from "lucide-react";
import { composeCaption } from "@/lib/platform-rules";
import type { ContentItem, Destination, MediaAsset } from "@/lib/types";
import { PLATFORM_LABEL } from "@/lib/types";
import { PlatformIcon, cx } from "./ui";

// Platform-styled post preview shown before approval (what will be published).

function MediaView({ media, item }: { media: MediaAsset[]; item: ContentItem }) {
  if (!media.length) {
    if (item.contentType === "carousel" && item.carousel.length)
      return (
        <div className="flex snap-x gap-2 overflow-x-auto bg-surface-2 p-3">
          {item.carousel.map((s, i) => (
            <div key={i} className="aspect-[4/5] w-56 shrink-0 snap-start rounded-lg bg-gradient-to-br from-indigo-600 to-slate-900 p-4 text-white">
              <p className="text-[10px] opacity-70">{i + 1}/{item.carousel.length}</p>
              <p className="mt-2 font-bold">{s.heading}</p>
              <p className="mt-2 text-xs opacity-90">{s.body}</p>
            </div>
          ))}
        </div>
      );
    if (["image", "reel", "short", "video"].includes(item.contentType))
      return <div className="flex aspect-video items-center justify-center bg-surface-2 text-sm text-muted">Media not generated yet</div>;
    return null;
  }
  const videos = media.filter((m) => m.mime.startsWith("video/"));
  const images = media.filter((m) => m.mime.startsWith("image/"));
  const pdf = media.find((m) => m.mime === "application/pdf");
  if (videos.length)
    return (
      <div className="flex justify-center bg-black">
        <video src={`/api/media/${videos[0].id}`} controls playsInline preload="metadata" className="max-h-[560px] w-full object-contain" />
      </div>
    );
  if (pdf)
    return (
      <div className="bg-surface-2">
        <object data={`/api/media/${pdf.id}#toolbar=0&view=FitH`} type="application/pdf" className="h-[480px] w-full">
          <a href={`/api/media/${pdf.id}`} className="flex items-center gap-2 p-4 text-sm underline">
            <FileText size={16} /> {pdf.name}
          </a>
        </object>
        <p className="border-t border-border px-3 py-1.5 text-xs text-muted">Document carousel · {item.carousel.length} slides</p>
      </div>
    );
  if (images.length > 1)
    return (
      <div className="flex snap-x snap-mandatory overflow-x-auto bg-surface-2">
        {images.map((m, i) => (
          <div key={m.id} className="relative w-full shrink-0 snap-center">
            <img src={`/api/media/${m.id}`} alt={m.name} className="w-full object-contain" />
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              {i + 1}/{images.length}
            </span>
          </div>
        ))}
      </div>
    );
  return <img src={`/api/media/${images[0].id}`} alt={item.imageConcept || item.title} className="w-full bg-surface-2 object-contain" />;
}

function Caption({ text, clamp }: { text: string; clamp?: number }) {
  const parts = text.split(/(#[\p{L}\p{N}_]+|https?:\/\/\S+)/gu);
  return (
    <p className={cx("whitespace-pre-wrap break-words text-sm leading-relaxed", clamp && "line-clamp-[var(--clamp)]")} style={clamp ? ({ "--clamp": clamp } as React.CSSProperties) : undefined}>
      {parts.map((p, i) =>
        p.startsWith("#") || p.startsWith("http") ? (
          <span key={i} className="font-medium text-[#0a66c2] dark:text-sky-400">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </p>
  );
}

export function PostPreview({ item, media, destination, businessName }: { item: ContentItem; media: MediaAsset[]; destination: Destination | null; businessName: string }) {
  const caption = composeCaption(item);
  const who = destination?.name.replace(" (personal profile)", "") || businessName || "Your account";
  const avatar = (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-sm font-bold text-white">
      {who.replace("@", "").slice(0, 1).toUpperCase()}
    </div>
  );
  const p = item.platform;

  if (p === "youtube" || p === "tiktok") {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <MediaView media={media} item={item} />
        <div className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <PlatformIcon platform={p} />
            <p className="font-semibold">{item.title}</p>
          </div>
          <p className="text-xs text-muted">{who}</p>
          <Caption text={caption} clamp={6} />
          {item.keywords.length > 0 && p === "youtube" && <p className="text-xs text-muted">Tags: {item.keywords.join(", ")}</p>}
        </div>
      </div>
    );
  }

  if (p === "pinterest") {
    return (
      <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-border bg-surface">
        <MediaView media={media} item={item} />
        <div className="space-y-1 p-4">
          <p className="font-bold">{item.title}</p>
          <Caption text={caption} clamp={4} />
          {item.link && <p className="truncate text-xs text-muted">{item.link}</p>}
          <p className="pt-1 text-xs text-muted">Board: {destination?.name ?? "—"}</p>
        </div>
      </div>
    );
  }

  const insta = p === "instagram";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-3 p-4">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{who}</p>
          <p className="flex items-center gap-1 text-xs text-muted">
            {p === "linkedin" && destination?.type === "organization" ? "Company Page · " : ""}
            {p === "x" ? "@" + who.replace("@", "") : "Now"} · <Globe size={11} />
          </p>
        </div>
        <PlatformIcon platform={p} />
      </div>
      {!insta && (
        <div className="px-4 pb-3">
          <Caption text={caption} clamp={p === "linkedin" ? 8 : undefined} />
        </div>
      )}
      <MediaView media={media} item={item} />
      {item.link && !media.length && !insta && (
        <div className="mx-4 mb-3 rounded-lg border border-border p-3 text-xs text-muted">
          <Globe size={12} className="mr-1 inline" /> {item.link}
        </div>
      )}
      {insta && (
        <div className="px-4 py-3">
          <div className="mb-2 flex gap-4">
            <Heart size={20} /> <MessageCircle size={20} /> <Send size={20} />
          </div>
          <p className="text-sm">
            <b className="mr-1">{who}</b>
          </p>
          <Caption text={caption} clamp={5} />
        </div>
      )}
      {!insta && (
        <div className="flex justify-around border-t border-border py-2 text-xs text-muted">
          <span className="flex items-center gap-1"><ThumbsUp size={14} /> Like</span>
          <span className="flex items-center gap-1"><MessageCircle size={14} /> Comment</span>
          <span className="flex items-center gap-1"><Repeat2 size={14} /> {p === "x" ? "Repost" : "Share"}</span>
        </div>
      )}
      <p className="border-t border-border bg-surface-2 px-4 py-1.5 text-[11px] text-muted">
        {PLATFORM_LABEL[p]} preview · {caption.length} characters
      </p>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarPlus, Loader2, Sparkles } from "lucide-react";
import { createCalendarAction, createContentAction } from "@/app/actions";
import { MediaPicker } from "@/components/media-picker";
import { useToast } from "@/components/shell";
import { Card, PlatformIcon, btn, cx } from "@/components/ui";
import { PLATFORM_RULES } from "@/lib/platform-rules";
import { CATEGORIES, CONTENT_TYPE_LABEL, CONTENT_TYPES, LANGUAGES, PLATFORMS, PLATFORM_LABEL, VIDEO_STYLES, type ContentType, type MediaAsset, type Platform } from "@/lib/types";

export function CreateForm({ initialType, preferred, language, library, initialMedia = [] }: { initialType: ContentType; preferred: Platform[]; language: string; library: MediaAsset[]; initialMedia?: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [type, setType] = useState<ContentType>(initialType);
  const [platforms, setPlatforms] = useState<Platform[]>(preferred);
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<string>("Educational");
  const [lang, setLang] = useState(language || "English");
  const [style, setStyle] = useState("Modern");
  const [instruction, setInstruction] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>(initialMedia);
  const [count, setCount] = useState(5);
  const isVideo = ["reel", "short", "video"].includes(type);
  const supported = (p: Platform) => {
    const s = PLATFORM_RULES[p].supportedTypes;
    if (s.includes(type)) return true;
    if (isVideo) return s.some((x) => ["reel", "short", "video"].includes(x));
    return s.includes("image");
  };

  const submit = () =>
    start(async () => {
      const r = await createContentAction({ topic, category, platforms: platforms.filter(supported), contentType: type, language: lang, instruction, videoStyle: style, mediaIds });
      if (!r.ok) return toast("error", r.error);
      toast("success", "Content created — review and approve it.");
      const ids = r.data ?? [];
      router.push(ids[0] ? `/library/${ids[0]}` : "/library");
    });

  const plan = (kind: "week" | "month" | "batch") =>
    start(async () => {
      const r = await createCalendarAction(kind, { platforms, language: lang, instruction, count, contentType: kind === "batch" ? type : null, topic });
      if (!r.ok) return toast("error", r.error);
      toast("success", `Planned ${r.data?.items ?? 0} posts. They are being generated and will wait for your approval.`);
      router.push("/calendar");
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="space-y-5 p-5">
        <div>
          <label className="label">What should we post about?</label>
          <textarea className="input" rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Why modular interiors save project time" />
        </div>
        <div>
          <label className="label">Format</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map((t) => (
              <button key={t} onClick={() => setType(t)} className={cx("rounded-lg border px-3 py-1.5 text-sm", type === t ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border")}>
                {CONTENT_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Platforms (each gets its own optimised version)</label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const ok = supported(p);
              const on = platforms.includes(p);
              return (
                <button
                  key={p}
                  disabled={!ok}
                  title={ok ? undefined : `${PLATFORM_LABEL[p]} doesn't support this format`}
                  onClick={() => setPlatforms((x) => (on ? x.filter((y) => y !== p) : [...x, p]))}
                  className={cx("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40", on && ok ? "border-primary bg-primary/10" : "border-border")}
                >
                  <PlatformIcon platform={p} size={18} /> {PLATFORM_LABEL[p]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Language</label>
            <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {isVideo && (
            <div>
              <label className="label">Video style</label>
              <select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
                {VIDEO_STYLES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="label">Extra instructions (optional)</label>
          <input className="input" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. mention our free consultation, keep it under 100 words" />
        </div>
        <div>
          <label className="label">{isVideo ? "Images / video clips / logo for the video" : "Your images (optional — otherwise the AI designs one)"}</label>
          <MediaPicker library={library} value={mediaIds} onChange={setMediaIds} />
        </div>
        <button className={`${btn("primary", "lg")} w-full sm:w-auto`} disabled={pending || !topic.trim() || !platforms.some(supported)} onClick={submit}>
          {pending ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />} Generate {CONTENT_TYPE_LABEL[type].toLowerCase()}
        </button>
        {pending && <p className="text-xs text-muted">The agents are writing, designing and quality-checking… this can take up to a minute{isVideo ? " (video rendering included)" : ""}.</p>}
      </Card>

      <div className="space-y-4">
        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">Plan in bulk</h3>
          <p className="text-xs text-muted">Uses the platforms, language and instructions on the left. Everything lands in the calendar as <b>Waiting approval</b>.</p>
          <button className={`${btn("primary")} w-full`} disabled={pending || !platforms.length} onClick={() => plan("week")}>
            <CalendarPlus size={16} /> CREATE MY WEEK
          </button>
          <p className="text-[11px] text-muted">Mon Educational · Tue Reel · Wed Carousel · Thu Industry tip · Fri Promotional · Sat Behind the scenes · Sun Engagement</p>
          <button className={`${btn("secondary")} w-full`} disabled={pending || !platforms.length} onClick={() => plan("month")}>
            CREATE 30 DAYS
          </button>
          <div className="flex gap-2">
            <input type="number" min={1} max={30} className="input w-20" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            <button className={`${btn("secondary")} flex-1`} disabled={pending || !platforms.length} onClick={() => plan("batch")}>
              Create {count} {CONTENT_TYPE_LABEL[type].toLowerCase()}s
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

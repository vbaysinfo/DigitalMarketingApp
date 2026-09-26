"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { saveProfileAction, saveSettingsAction } from "@/app/actions";
import { MediaPicker } from "@/components/media-picker";
import { useToast } from "@/components/shell";
import { Card, PlatformIcon, btn, cx } from "@/components/ui";
import { BRAND_VOICES, LANGUAGES, PLATFORMS, PLATFORM_LABEL, type AppSettings, type BusinessProfile, type MediaAsset } from "@/lib/types";

export function SettingsForms({ profile, settings, library }: { profile: BusinessProfile; settings: AppSettings; library: MediaAsset[] }) {
  const [p, setP] = useState(profile);
  const [s, setS] = useState(settings);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const set = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K]) => setP({ ...p, [k]: v });
  const text = (k: keyof BusinessProfile, label: string, rows = 0, placeholder = "") => (
    <div>
      <label className="label">{label}</label>
      {rows ? (
        <textarea className="input" rows={rows} value={p[k] as string} placeholder={placeholder} onChange={(e) => set(k, e.target.value as never)} />
      ) : (
        <input className="input" value={p[k] as string} placeholder={placeholder} onChange={(e) => set(k, e.target.value as never)} />
      )}
    </div>
  );
  const save = () =>
    start(async () => {
      const a = await saveProfileAction(p);
      const b = await saveSettingsAction(s);
      if (!a.ok) toast("error", a.error);
      else if (!b.ok) toast("error", b.error);
      else toast("success", "Settings saved — the AI will use them for new content.");
      router.refresh();
    });
  const tzs = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [s.timezone];
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Business profile</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {text("businessName", "Business name")}
          {text("industry", "Industry")}
          <div className="md:col-span-2">{text("description", "Business description", 3)}</div>
          {text("products", "Products", 2, "Comma separated")}
          {text("services", "Services", 2, "Comma separated")}
          {text("targetAudience", "Target audience", 2)}
          {text("location", "Location")}
          {text("website", "Website", 0, "https://")}
          {text("contact", "Contact information")}
          {text("whatsapp", "WhatsApp")}
          <div>
            <label className="label">Logo</label>
            <MediaPicker library={library} value={p.logoMediaId ? [p.logoMediaId] : []} onChange={(ids) => set("logoMediaId", ids[ids.length - 1] ?? "")} accept="image/*" />
          </div>
          <div>
            <label className="label">Brand colors (primary, secondary, accent)</label>
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded border border-border"
                  value={p.brandColors[i] ?? "#000000"}
                  onChange={(e) => {
                    const c = [...p.brandColors];
                    c[i] = e.target.value;
                    set("brandColors", c);
                  }}
                  aria-label={`Brand color ${i + 1}`}
                />
              ))}
            </div>
          </div>
          {text("brandFonts", "Brand fonts")}
          {text("brandStyle", "Brand style", 0, "e.g. minimal, warm, premium")}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Brand voice & AI memory</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Brand voice</label>
            <select className="input" value={p.brandVoice} onChange={(e) => set("brandVoice", e.target.value)}>
              {BRAND_VOICES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          {text("preferredTone", "Preferred tone")}
          <div>
            <label className="label">Preferred language</label>
            <select className="input" value={p.preferredLanguage} onChange={(e) => set("preferredLanguage", e.target.value)}>
              {LANGUAGES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            {text("customRules", "Custom instructions / brand rules", 4, "Always use simple English.\nDo not use too many emojis.\nKeep LinkedIn posts professional.")}
          </div>
          <div className="md:col-span-2">
            <label className="label">Preferred platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((pl) => {
                const on = p.preferredPlatforms.includes(pl);
                return (
                  <button key={pl} type="button" onClick={() => set("preferredPlatforms", on ? p.preferredPlatforms.filter((x) => x !== pl) : [...p.preferredPlatforms, pl])} className={cx("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm", on ? "border-primary bg-primary/10" : "border-border")}>
                    <PlatformIcon platform={pl} size={16} /> {PLATFORM_LABEL[pl]}
                  </button>
                );
              })}
            </div>
          </div>
          {text("postingFrequency", "Posting frequency")}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Publishing</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label">Approval mode</label>
            <div className="grid gap-2 md:grid-cols-3">
              {([
                ["manual", "Manual approval", "Approve every post, then Post now or Schedule."],
                ["approve_schedule", "Approve & schedule", "Approve and pick a date/time for each post."],
                ["queue", "Approved content queue", "Approved posts are automatically placed into your next free calendar slots."],
              ] as const).map(([k, t, d]) => (
                <button key={k} type="button" onClick={() => setS({ ...s, publishingMode: k })} className={cx("rounded-xl border p-3 text-left", s.publishingMode === k ? "border-primary bg-primary/10" : "border-border")}>
                  <p className="text-sm font-semibold">{t}</p>
                  <p className="text-xs text-muted">{d}</p>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">In every mode, content must be approved before it can be published.</p>
          </div>
          <div>
            <label className="label">Time zone</label>
            <select className="input" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>
              {tzs.map((z) => <option key={z}>{z}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Posting times (queue slots)</label>
            <input className="input" value={s.postingTimes.join(", ")} onChange={(e) => setS({ ...s, postingTimes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="10:00, 18:00" />
          </div>
          <div>
            <label className="label">Max posts per day per platform</label>
            <input type="number" min={1} max={10} className="input" value={s.maxPostsPerDayPerPlatform} onChange={(e) => setS({ ...s, maxPostsPerDayPerPlatform: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Duplicate check window (days)</label>
            <input type="number" min={1} max={365} className="input" value={s.duplicateWindowDays} onChange={(e) => setS({ ...s, duplicateWindowDays: Number(e.target.value) })} />
          </div>
        </div>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <button className={`${btn("primary", "lg")} shadow-lg`} onClick={save} disabled={pending}>
          {pending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save settings
        </button>
      </div>
    </div>
  );
}

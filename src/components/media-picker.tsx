"use client";

import { useRef, useState } from "react";
import { FileText, Film, Loader2, Upload, X } from "lucide-react";
import type { MediaAsset } from "@/lib/types";
import { btn, cx } from "./ui";
import { useToast } from "./shell";

export async function uploadFiles(files: FileList | File[], category = ""): Promise<MediaAsset[]> {
  const fd = new FormData();
  for (const f of Array.from(files)) fd.append("files", f);
  if (category) fd.append("category", category);
  const r = await fetch("/api/media/upload", { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Upload failed");
  return j.assets as MediaAsset[];
}

export function Thumb({ m, className }: { m: MediaAsset; className?: string }) {
  if (m.mime.startsWith("image/")) return <img src={`/api/media/${m.id}`} alt={m.name} className={cx("h-full w-full object-cover", className)} loading="lazy" />;
  return (
    <div className={cx("flex h-full w-full flex-col items-center justify-center gap-1 bg-surface-2 p-1 text-center text-[10px] text-muted", className)}>
      {m.mime.startsWith("video/") ? <Film size={20} /> : <FileText size={20} />}
      <span className="line-clamp-2 break-all">{m.name}</span>
    </div>
  );
}

/** Select media from the library or upload new files. */
export function MediaPicker({ library, value, onChange, accept = "image/*,video/*,application/pdf" }: { library: MediaAsset[]; value: string[]; onChange: (ids: string[]) => void; accept?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(library);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const selected = value.map((id) => items.find((m) => m.id === id)).filter((m): m is MediaAsset => Boolean(m));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {selected.map((m) => (
          <div key={m.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-border">
            <Thumb m={m} />
            <button type="button" onClick={() => toggle(m.id)} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white" aria-label="Remove">
              <X size={12} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted hover:bg-surface-2">
          <Upload size={16} /> Add media
        </button>
      </div>
      {open && (
        <div className="mt-3 rounded-xl border border-border bg-surface-2 p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            <input className="input max-w-xs" placeholder="Search media…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className={btn("secondary", "sm")} onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
            </button>
            <input
              ref={input}
              type="file"
              multiple
              accept={accept}
              hidden
              onChange={async (e) => {
                if (!e.target.files?.length) return;
                setBusy(true);
                try {
                  const up = await uploadFiles(e.target.files);
                  setItems((x) => [...up, ...x]);
                  onChange([...value, ...up.map((u) => u.id)]);
                  toast("success", `Uploaded ${up.length} file(s)`);
                } catch (err) {
                  toast("error", (err as Error).message);
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </div>
          <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
            {items
              .filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()))
              .map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={cx("aspect-square overflow-hidden rounded-lg border-2", value.includes(m.id) ? "border-primary" : "border-transparent")}
                  title={m.name}
                >
                  <Thumb m={m} />
                </button>
              ))}
            {!items.length && <p className="col-span-full text-sm text-muted">No media yet — upload images, videos or your logo.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

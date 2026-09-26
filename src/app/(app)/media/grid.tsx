"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { deleteMediaAction, renameMediaAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { Thumb, uploadFiles } from "@/components/media-picker";
import { useToast } from "@/components/shell";
import { Card, Empty, btn, cx } from "@/components/ui";
import { MEDIA_CATEGORIES, type MediaAsset } from "@/lib/types";

export function MediaGrid({ items, category, q }: { items: MediaAsset[]; category: string; q: string }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadCat, setUploadCat] = useState(category || "Images");
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; category: string } | null>(null);
  const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/media" className="flex flex-wrap gap-2">
          <input name="q" defaultValue={q} className="input w-56" placeholder="Search…" />
          {category && <input type="hidden" name="category" value={category} />}
        </form>
        <div className="flex gap-1 overflow-x-auto">
          <Link href="/media" className={cx("rounded-full border px-3 py-1 text-xs", !category ? "border-primary bg-primary/10 text-primary" : "border-border")}>All</Link>
          {MEDIA_CATEGORIES.map((c) => (
            <Link key={c} href={`/media?category=${encodeURIComponent(c)}`} className={cx("whitespace-nowrap rounded-full border px-3 py-1 text-xs", category === c ? "border-primary bg-primary/10 text-primary" : "border-border")}>
              {c}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <select className="input w-auto" value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} aria-label="Upload category">
            {MEDIA_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className={btn("primary")} onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Upload
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept="image/*,video/*,application/pdf"
            onChange={async (e) => {
              if (!e.target.files?.length) return;
              setBusy(true);
              try {
                const up = await uploadFiles(e.target.files, uploadCat);
                toast("success", `Uploaded ${up.length} file(s)`);
                router.refresh();
              } catch (err) {
                toast("error", (err as Error).message);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>
      {items.length === 0 ? (
        <Empty title="No media yet">Upload images, videos, your logo and brand assets to reuse them in posts and reels.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {items.map((m) => (
            <Card key={m.id} className="overflow-hidden">
              <button className="block aspect-square w-full bg-surface-2" onClick={() => setPreview(m)}>
                <Thumb m={m} />
              </button>
              <div className="p-2">
                <p className="truncate text-xs font-medium" title={m.name}>{m.name}</p>
                <p className="text-[10px] text-muted">{m.category} · {size(m.size)}{m.width ? ` · ${m.width}×${m.height}` : ""}{m.source === "generated" ? " · AI" : ""}</p>
                <div className="mt-1 flex gap-1">
                  <button className={btn("ghost", "sm")} onClick={() => setEditing({ id: m.id, name: m.name, category: m.category })} aria-label="Rename">
                    <Pencil size={12} />
                  </button>
                  <ActionButton size="sm" variant="ghost" confirm={`Delete ${m.name}?`} action={() => deleteMediaAction(m.id)} success="Deleted">
                    <Trash2 size={12} />
                  </ActionButton>
                  <Link href={`/create?media=${m.id}`} className={`${btn("ghost", "sm")} ml-auto`}>Use</Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            {preview.mime.startsWith("image/") && <img src={`/api/media/${preview.id}`} alt={preview.name} className="max-h-[85vh] rounded-lg" />}
            {preview.mime.startsWith("video/") && <video src={`/api/media/${preview.id}`} controls autoPlay className="max-h-[85vh] rounded-lg" />}
            {preview.mime === "application/pdf" && <object data={`/api/media/${preview.id}`} type="application/pdf" className="h-[85vh] w-[80vw] rounded-lg bg-white" />}
            <p className="mt-2 text-center text-sm text-white">{preview.name}</p>
          </div>
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm space-y-3 p-5">
            <h3 className="font-semibold">Rename media</h3>
            <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <select className="input" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
              {MEDIA_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button className={btn("ghost")} onClick={() => setEditing(null)}>Cancel</button>
              <ActionButton variant="primary" action={() => renameMediaAction(editing.id, editing.name, editing.category)} onDone={() => setEditing(null)} success="Saved">
                Save
              </ActionButton>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

import { NextResponse } from "next/server";
import sharp from "sharp";
import { ALLOWED_MIME, saveMedia } from "@/lib/repo/media";
import { MEDIA_CATEGORIES } from "@/lib/types";

const MAX = 500 * 1024 * 1024;

export async function POST(req: Request) {
  const fd = await req.formData();
  const category = String(fd.get("category") || "");
  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });
  const out = [];
  for (const f of files) {
    if (!ALLOWED_MIME.has(f.type)) return NextResponse.json({ error: `Unsupported type: ${f.type || f.name}` }, { status: 415 });
    if (f.size > MAX) return NextResponse.json({ error: `${f.name} is larger than 500 MB` }, { status: 413 });
    const data = Buffer.from(await f.arrayBuffer());
    let width: number | null = null;
    let height: number | null = null;
    if (f.type.startsWith("image/")) {
      try {
        const m = await sharp(data).metadata();
        width = m.width ?? null;
        height = m.height ?? null;
      } catch {
        return NextResponse.json({ error: `${f.name} is not a valid image` }, { status: 400 });
      }
    }
    const cat = (MEDIA_CATEGORIES as readonly string[]).includes(category)
      ? category
      : f.type.startsWith("video/")
        ? "Videos"
        : f.type === "application/pdf"
          ? "Documents"
          : "Images";
    out.push(saveMedia({ name: f.name, category: cat, mime: f.type, data, width, height }));
  }
  return NextResponse.json({ assets: out });
}

import sharp from "sharp";
import fs from "node:fs";
import { getMedia, mediaPath } from "@/lib/repo/media";
import { hmac, safeEqual } from "@/lib/crypto";
import { serveFile } from "@/lib/media/serve";

// Short-lived signed URLs for platforms that fetch media themselves (e.g. Instagram).
export async function GET(req: Request, ctx: RouteContext<"/api/media/public/[id]">) {
  const { id } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const exp = q.get("exp") ?? "";
  const fmt = q.get("fmt") === "jpg" ? "jpg" : "orig";
  const sig = q.get("sig") ?? "";
  if (!exp || Number(exp) * 1000 < Date.now() || !safeEqual(sig, hmac(`${id}|${exp}|${fmt}`))) {
    return new Response("Forbidden", { status: 403 });
  }
  const asset = getMedia(id);
  const p = mediaPath(id);
  if (!asset || !p) return new Response("Not found", { status: 404 });
  if (fmt === "jpg" && asset.mime.startsWith("image/") && asset.mime !== "image/jpeg") {
    const jpg = await sharp(fs.readFileSync(p)).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpg.length) } });
  }
  return serveFile(req, p, asset.mime, asset.name);
}

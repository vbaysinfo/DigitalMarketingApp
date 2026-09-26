import { getMedia, mediaPath } from "@/lib/repo/media";
import { serveFile } from "@/lib/media/serve";

// Authenticated media delivery (proxy.ts enforces the session). Supports HTTP range for video.
export async function GET(req: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  const asset = getMedia(id);
  const p = mediaPath(id);
  if (!asset || !p) return new Response("Not found", { status: 404 });
  return serveFile(req, p, asset.mime, asset.name);
}

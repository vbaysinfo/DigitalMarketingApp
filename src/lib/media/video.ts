import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { renderCard, type Format } from "./graphics";
import { getMedia, mediaPath, saveMedia } from "../repo/media";
import type { MediaAsset, VideoPlan } from "../types";

// Video / Reel Agent rendering step: turns the AI's scene-by-scene plan plus the
// user's uploaded images/clips/logo into a real MP4 (H.264/AAC), sized per
// platform (9:16 for Reels/Shorts/TikTok, 16:9 for YouTube, 1:1 for feeds).

function ffmpegPath(): string | null {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    return p && fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

export function videoRenderingAvailable(): boolean {
  return ffmpegPath() !== null;
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d.toString()).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${err.slice(-800)}`))));
  });
}

const DIMS: Record<Format, [number, number]> = {
  story: [1080, 1920],
  landscape: [1920, 1080],
  square: [1080, 1080],
  portrait: [1080, 1350],
  pin: [1000, 1500],
};

async function textOverlay(w: number, h: number, big: string, sub: string, style: string): Promise<Buffer> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const size = Math.round(w * 0.075);
  const words = big.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const wd of words) {
    if ((cur + " " + wd).trim().length > 16 && cur) {
      lines.push(cur);
      cur = wd;
    } else cur = (cur + " " + wd).trim();
  }
  if (cur) lines.push(cur);
  const startY = h * 0.42 - (lines.length * size * 1.1) / 2;
  const subSize = Math.round(w * 0.036);
  const subLines = sub.match(/.{1,38}(\s|$)/g)?.slice(0, 3) ?? [];
  const accent = style === "Luxury" ? "#d4af37" : style === "Fast-paced" ? "#facc15" : "#ffffff";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="'Noto Sans','Noto Sans Telugu','Noto Sans Devanagari','DejaVu Sans',Arial,sans-serif">
    ${lines
      .map(
        (l, i) =>
          `<text x="${w / 2}" y="${startY + (i + 1) * size * 1.1}" text-anchor="middle" font-size="${size}" font-weight="800" fill="${accent}" stroke="#000" stroke-opacity="0.35" stroke-width="3">${esc(l)}</text>`,
      )
      .join("")}
    ${subLines.length ? `<rect x="${w * 0.06}" y="${h * 0.8 - subSize * 1.2}" width="${w * 0.88}" height="${subLines.length * subSize * 1.35 + subSize * 0.8}" rx="18" fill="#000" fill-opacity="0.55"/>` : ""}
    ${subLines
      .map(
        (l, i) =>
          `<text x="${w / 2}" y="${h * 0.8 + i * subSize * 1.35}" text-anchor="middle" font-size="${subSize}" fill="#fff">${esc(l.trim())}</text>`,
      )
      .join("")}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function renderVideo(opts: {
  name: string;
  plan: VideoPlan;
  format: Format;
  mediaIds: string[]; // user-provided images/videos used as scene backgrounds
}): Promise<{ video: MediaAsset; thumbnail: MediaAsset }> {
  const bin = ffmpegPath();
  if (!bin) throw new Error("Video rendering is unavailable: ffmpeg not found (set FFMPEG_PATH).");
  const [w, h] = DIMS[opts.format];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-"));
  const sources = opts.mediaIds
    .map((id) => ({ asset: getMedia(id), file: mediaPath(id) }))
    .filter((m): m is { asset: MediaAsset; file: string } => Boolean(m.asset && m.file))
    .filter((m) => m.asset.mime.startsWith("image/") || m.asset.mime.startsWith("video/"));
  const fps = 30;
  const segs: string[] = [];
  const common = ["-r", String(fps), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-shortest", "-y"];
  try {
    const scenes = opts.plan.scenes.length ? opts.plan.scenes : [{ label: "Hook", durationSec: 4, visual: "", onScreenText: opts.plan.idea, voiceOver: "" }];
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const dur = Math.min(Math.max(Number(s.durationSec) || 3, 1.5), 15);
      const src = sources.length ? sources[i % sources.length] : null;
      const seg = path.join(dir, `seg${i}.mp4`);
      const fast = opts.plan.style === "Fast-paced";
      if (src?.asset.mime.startsWith("video/")) {
        const ov = path.join(dir, `ov${i}.png`);
        fs.writeFileSync(ov, await textOverlay(w, h, s.onScreenText, s.voiceOver, opts.plan.style));
        await run(bin, [
          "-i", src.file, "-loop", "1", "-i", ov, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(dur),
          "-filter_complex", `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[bg];[bg][1:v]overlay=0:0,format=yuv420p[v]`,
          "-map", "[v]", "-map", "2:a", ...common, seg,
        ]);
      } else {
        const frame = path.join(dir, `f${i}.png`);
        const png = await renderCard({
          format: opts.format,
          headline: s.onScreenText || s.label,
          subtext: s.voiceOver,
          kicker: i === 0 ? undefined : s.label,
          photoId: src ? opts.mediaIds[i % opts.mediaIds.length] : null,
          footer: i === scenes.length - 1 ? undefined : "",
        });
        fs.writeFileSync(frame, await sharp(png).resize(w, h, { fit: "cover" }).png().toBuffer());
        const frames = Math.round(dur * fps);
        const zoom = fast ? 0.0022 : 0.0008;
        await run(bin, [
          "-loop", "1", "-i", frame, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(dur),
          "-vf", `scale=${w * 2}:${h * 2},zoompan=z='min(zoom+${zoom},1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps},fade=t=in:st=0:d=0.3,format=yuv420p`,
          "-map", "0:v", "-map", "1:a", ...common, seg,
        ]);
      }
      segs.push(seg);
    }
    const list = path.join(dir, "list.txt");
    fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join("\n"));
    const out = path.join(dir, "out.mp4");
    await run(bin, ["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", "-y", out]);
    const total = scenes.reduce((a, s) => a + Math.min(Math.max(Number(s.durationSec) || 3, 1.5), 15), 0);
    const video = saveMedia({
      name: `${opts.name}.mp4`,
      category: "Reels",
      mime: "video/mp4",
      data: fs.readFileSync(out),
      width: w,
      height: h,
      durationSec: total,
      source: "generated",
    });
    const thumbPng = await renderCard({
      format: opts.format === "story" ? "story" : "landscape",
      headline: opts.plan.scenes[0]?.onScreenText || opts.plan.idea,
      photoId: opts.mediaIds.find((id) => getMedia(id)?.mime.startsWith("image/")) ?? null,
    });
    const thumbnail = saveMedia({ name: `${opts.name} — cover.png`, category: "Thumbnails", mime: "image/png", data: thumbPng, source: "generated" });
    return { video, thumbnail };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

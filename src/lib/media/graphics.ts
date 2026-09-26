import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import { PDFDocument } from "pdf-lib";
import { getProfile } from "../repo/misc";
import { readMedia, saveMedia } from "../repo/media";
import type { CarouselSlide, MediaAsset } from "../types";

// Image Post / Carousel agents' rendering step. Produces real PNG/PDF files from
// the AI's concept using the brand colors, logo and (optionally) a user photo.
// A generative image model can be plugged in via `ImageProvider` below.

export type Format = "square" | "portrait" | "landscape" | "story" | "pin";
const SIZES: Record<Format, [number, number]> = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  landscape: [1200, 627],
  story: [1080, 1920],
  pin: [1000, 1500],
};

export type ImageProvider = (prompt: string, format: Format) => Promise<Buffer | null>;
/** Hook for an external generative image model. Returns null when none is configured. */
export const imageProvider: ImageProvider = async () => null;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S*$/, "") + "…";
    return cut;
  }
  return lines;
}

function isDark(hex: string): boolean {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return true;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}

async function logoLayer(size: number): Promise<Buffer | null> {
  const id = getProfile().logoMediaId;
  if (!id) return null;
  try {
    const { data, asset } = readMedia(id);
    if (!asset.mime.startsWith("image/")) return null;
    return await sharp(data).resize(size, size, { fit: "inside" }).png().toBuffer();
  } catch {
    return null;
  }
}

async function background(w: number, h: number, photoId: string | null, c1: string, c2: string): Promise<Buffer> {
  if (photoId) {
    try {
      const { data, asset } = readMedia(photoId);
      if (asset.mime.startsWith("image/")) {
        return await sharp(data).resize(w, h, { fit: "cover" }).png().toBuffer();
      }
    } catch {
      /* fall back to gradient */
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${w * 0.9}" cy="${h * 0.12}" r="${w * 0.28}" fill="#ffffff" fill-opacity="0.06"/>
    <circle cx="${w * 0.05}" cy="${h * 0.95}" r="${w * 0.35}" fill="#000000" fill-opacity="0.08"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export type CardSpec = {
  format: Format;
  kicker?: string;
  headline: string;
  subtext?: string;
  footer?: string;
  photoId?: string | null;
  pageLabel?: string;
};

/** Render one branded card (PNG buffer). */
export async function renderCard(spec: CardSpec): Promise<Buffer> {
  const p = getProfile();
  const [w, h] = SIZES[spec.format];
  const c1 = p.brandColors[0] || "#4f46e5";
  const c2 = p.brandColors[1] || "#0f172a";
  const hasPhoto = Boolean(spec.photoId);
  const fg = hasPhoto || isDark(c1) ? "#ffffff" : "#0f172a";
  const font = `${p.brandFonts ? esc(p.brandFonts) + ", " : ""}'Noto Sans', 'Noto Sans Telugu', 'Noto Sans Devanagari', 'DejaVu Sans', Arial, sans-serif`;
  const pad = Math.round(w * 0.08);
  const headSize = Math.round(w * (spec.headline.length > 60 ? 0.058 : 0.072));
  const headLines = wrap(spec.headline, Math.floor((w - pad * 2) / (headSize * 0.55)), 6);
  const subSize = Math.round(w * 0.034);
  const subLines = spec.subtext ? wrap(spec.subtext, Math.floor((w - pad * 2) / (subSize * 0.52)), 7) : [];
  const blockH = headLines.length * headSize * 1.15 + (subLines.length ? subSize * 1.4 * subLines.length + headSize * 0.6 : 0);
  let y = Math.max(pad * 1.8, (h - blockH) / 2);
  const text: string[] = [];
  if (spec.kicker)
    text.push(
      `<text x="${pad}" y="${pad * 1.1}" font-size="${Math.round(w * 0.028)}" font-weight="700" letter-spacing="2" fill="${fg}" fill-opacity="0.85">${esc(spec.kicker.toUpperCase())}</text>`,
    );
  for (const l of headLines) {
    y += headSize;
    text.push(`<text x="${pad}" y="${y}" font-size="${headSize}" font-weight="800" fill="${fg}">${esc(l)}</text>`);
    y += headSize * 0.15;
  }
  if (subLines.length) y += headSize * 0.5;
  for (const l of subLines) {
    y += subSize * 1.4;
    text.push(`<text x="${pad}" y="${y}" font-size="${subSize}" fill="${fg}" fill-opacity="0.9">${esc(l)}</text>`);
  }
  const footer = spec.footer ?? [p.businessName, p.website].filter(Boolean).join("  ·  ");
  if (footer)
    text.push(
      `<text x="${pad}" y="${h - pad * 0.8}" font-size="${Math.round(w * 0.026)}" font-weight="600" fill="${fg}" fill-opacity="0.9">${esc(footer)}</text>`,
    );
  if (spec.pageLabel)
    text.push(
      `<text x="${w - pad}" y="${h - pad * 0.8}" text-anchor="end" font-size="${Math.round(w * 0.026)}" fill="${fg}" fill-opacity="0.8">${esc(spec.pageLabel)}</text>`,
    );
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" font-family="${font}">
    ${hasPhoto ? `<rect width="100%" height="100%" fill="#000" fill-opacity="0.45"/>` : ""}
    <rect x="${pad}" y="${pad * 1.35}" width="${Math.round(w * 0.12)}" height="${Math.round(w * 0.008)}" fill="${p.brandColors[2] || fg}"/>
    ${text.join("\n")}
  </svg>`;
  const layers: OverlayOptions[] = [{ input: Buffer.from(overlay) }];
  const logo = await logoLayer(Math.round(w * 0.12));
  if (logo) layers.push({ input: logo, top: Math.round(pad * 0.6), left: w - pad - Math.round(w * 0.12) });
  const bg = await background(w, h, spec.photoId ?? null, c1, c2);
  return sharp(bg).composite(layers).png().toBuffer();
}

export function formatFor(platform: string, contentType: string): Format {
  if (platform === "pinterest") return "pin";
  if (["reel", "short"].includes(contentType) || platform === "tiktok") return "story";
  if (platform === "linkedin" || platform === "x" || platform === "facebook") return contentType === "carousel" ? "portrait" : "square";
  if (platform === "youtube") return "landscape";
  return "portrait";
}

/** Image Post Agent: render the post image (uses a generative provider if configured). */
export async function generatePostImage(opts: {
  name: string;
  prompt: string;
  headline: string;
  subtext?: string;
  kicker?: string;
  format: Format;
  photoId?: string | null;
}): Promise<MediaAsset> {
  const generated = await imageProvider(opts.prompt, opts.format);
  const png =
    generated ??
    (await renderCard({ format: opts.format, headline: opts.headline, subtext: opts.subtext, kicker: opts.kicker, photoId: opts.photoId }));
  const [w, h] = SIZES[opts.format];
  return saveMedia({ name: opts.name, category: "Images", mime: "image/png", data: png, width: w, height: h, source: "generated" });
}

/** Carousel Agent: render slide PNGs and a PDF (LinkedIn publishes carousels as documents). */
export async function generateCarousel(opts: {
  name: string;
  slides: CarouselSlide[];
  format: Format;
  photoIds?: string[];
}): Promise<{ images: MediaAsset[]; pdf: MediaAsset }> {
  const [w, h] = SIZES[opts.format];
  const pngs: Buffer[] = [];
  for (let i = 0; i < opts.slides.length; i++) {
    const s = opts.slides[i];
    pngs.push(
      await renderCard({
        format: opts.format,
        headline: s.heading,
        subtext: s.body,
        pageLabel: `${i + 1}/${opts.slides.length}`,
        photoId: i === 0 ? (opts.photoIds?.[0] ?? null) : null,
      }),
    );
  }
  const images = pngs.map((data, i) =>
    saveMedia({ name: `${opts.name} — slide ${i + 1}`, category: "Images", mime: "image/png", data, width: w, height: h, source: "generated" }),
  );
  const pdf = await PDFDocument.create();
  for (const data of pngs) {
    const img = await pdf.embedPng(data);
    const page = pdf.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  pdf.setTitle(opts.name);
  const pdfAsset = saveMedia({
    name: `${opts.name}.pdf`,
    category: "Documents",
    mime: "application/pdf",
    data: Buffer.from(await pdf.save()),
    source: "generated",
  });
  return { images, pdf: pdfAsset };
}

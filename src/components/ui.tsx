import clsx from "clsx";
import type { ContentStatus, Platform } from "@/lib/types";
import { PLATFORM_LABEL, STATUS_LABEL } from "@/lib/types";

export const cx = clsx;

export function btn(variant: "primary" | "approve" | "secondary" | "ghost" | "danger" = "secondary", size: "sm" | "md" | "lg" = "md") {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
    size === "sm" && "px-2.5 py-1.5 text-xs",
    size === "md" && "px-3.5 py-2 text-sm",
    size === "lg" && "px-5 py-3 text-base",
    variant === "primary" && "bg-primary text-primary-fg hover:opacity-90 shadow-sm",
    variant === "approve" && "bg-approve text-white hover:bg-approve-hover shadow-md shadow-green-600/20 ring-1 ring-green-700/20",
    variant === "secondary" && "border border-border bg-surface text-text hover:bg-surface-2",
    variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-text",
    variant === "danger" && "border border-red-300/60 text-danger hover:bg-red-50 dark:hover:bg-red-950/40",
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx("rounded-2xl border border-border bg-surface shadow-sm", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<ContentStatus, string> = {
  IDEA: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  GENERATING: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 animate-pulse",
  DRAFT: "bg-slate-100 text-slate-700 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600",
  WAITING_FOR_APPROVAL: "bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800",
  APPROVED: "bg-sky-100 text-sky-800 ring-1 ring-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-800",
  SCHEDULED: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800",
  PUBLISHING: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 animate-pulse",
  PUBLISHED: "bg-green-100 text-green-800 ring-1 ring-green-300 dark:bg-green-950 dark:text-green-300 dark:ring-green-800",
  PUBLISH_FAILED: "bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-950 dark:text-red-300 dark:ring-red-800",
  CANCELLED: "bg-zinc-100 text-zinc-500 line-through dark:bg-zinc-800 dark:text-zinc-400",
};

const STATUS_DOT: Record<ContentStatus, string> = {
  IDEA: "bg-slate-400",
  GENERATING: "bg-violet-500",
  DRAFT: "bg-slate-500",
  WAITING_FOR_APPROVAL: "bg-amber-500",
  APPROVED: "bg-sky-500",
  SCHEDULED: "bg-indigo-500",
  PUBLISHING: "bg-cyan-500",
  PUBLISHED: "bg-green-500",
  PUBLISH_FAILED: "bg-red-500",
  CANCELLED: "bg-zinc-400",
};

export function StatusBadge({ status, className }: { status: ContentStatus; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status], className)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export const PLATFORM_COLOR: Record<Platform, string> = {
  linkedin: "#0a66c2",
  instagram: "#d62976",
  facebook: "#1877f2",
  youtube: "#ff0000",
  x: "#111111",
  tiktok: "#00b2a9",
  pinterest: "#e60023",
};
const PLATFORM_ABBR: Record<Platform, string> = { linkedin: "in", instagram: "IG", facebook: "f", youtube: "▶", x: "𝕏", tiktok: "TT", pinterest: "P" };

export function PlatformIcon({ platform, size = 22 }: { platform: Platform; size?: number }) {
  return (
    <span
      aria-label={PLATFORM_LABEL[platform]}
      title={PLATFORM_LABEL[platform]}
      className="inline-flex shrink-0 items-center justify-center rounded-md font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.45, background: PLATFORM_COLOR[platform] }}
    >
      {PLATFORM_ABBR[platform]}
    </span>
  );
}

export function PlatformChip({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <PlatformIcon platform={platform} size={18} />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <Card className="min-w-0 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={clsx("mt-1 text-2xl font-bold", tone)}>{value}</p>
      {hint && <p className="mt-0.5 break-words text-xs text-muted">{hint}</p>}
    </Card>
  );
}

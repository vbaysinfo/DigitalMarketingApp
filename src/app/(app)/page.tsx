import Link from "next/link";
import { Bot, CalendarDays, CheckCircle2, Circle, Clapperboard, GalleryHorizontal, PenSquare } from "lucide-react";
import { listContent, statusCounts } from "@/lib/repo/content";
import { listAccounts } from "@/lib/repo/accounts";
import { getProfile, getSettings } from "@/lib/repo/misc";
import { analyticsSummary } from "@/lib/analytics";
import { aiConfigured } from "@/lib/ai/client";
import { Card, PageHeader, PlatformIcon, Stat, StatusBadge, btn } from "@/components/ui";
import { PlanButtons } from "./plan-buttons";
import { formatLocal } from "@/lib/time";

export default function Dashboard() {
  const c = statusCounts();
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const s = getSettings();
  const profile = getProfile();
  const accounts = listAccounts();
  const a = analyticsSummary();
  const waiting = listContent({ status: ["WAITING_FOR_APPROVAL"], limit: 6 });
  const upcoming = listContent({ status: ["SCHEDULED"], limit: 50 })
    .sort((x, y) => (x.scheduledAt ?? "").localeCompare(y.scheduledAt ?? ""))
    .slice(0, 6);
  const failed = listContent({ status: ["PUBLISH_FAILED"], limit: 5 });
  const reach = a.totals.reach ?? a.totals.impressions;
  const steps = [
    { done: aiConfigured(), label: "Configure AI (ANTHROPIC_API_KEY)", href: "/settings" },
    { done: Boolean(profile.businessName && profile.description), label: "Complete your business profile", href: "/settings" },
    { done: accounts.some((x) => x.status === "connected"), label: "Connect a social account (e.g. LinkedIn)", href: "/accounts" },
    { done: total > 0, label: "Create your first post", href: "/create" },
    { done: (c.PUBLISHED ?? 0) > 0, label: "Approve & post", href: "/library?status=WAITING_FOR_APPROVAL" },
  ];
  const quick = [
    { href: "/create?type=image", label: "Create Post", icon: PenSquare },
    { href: "/create?type=reel", label: "Create Reel", icon: Clapperboard },
    { href: "/create?type=carousel", label: "Create Carousel", icon: GalleryHorizontal },
    { href: "/agent", label: "AI Chat", icon: Bot },
    { href: "/calendar", label: "Content Calendar", icon: CalendarDays },
  ];
  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome${profile.businessName ? `, ${profile.businessName}` : ""}`} subtitle="Create → Review → Approve → Post → Analyze → Improve" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        <Stat label="Posts created" value={total} />
        <Stat label="Waiting approval" value={c.WAITING_FOR_APPROVAL ?? 0} tone="text-amber-600" />
        <Stat label="Scheduled" value={c.SCHEDULED ?? 0} tone="text-indigo-600 dark:text-indigo-400" />
        <Stat label="Published" value={c.PUBLISHED ?? 0} tone="text-green-600" />
        <Stat label="Failed" value={c.PUBLISH_FAILED ?? 0} tone="text-red-600" />
        <Stat label="Total reach" value={reach !== undefined ? reach.toLocaleString() : "—"} hint={a.measured ? `${a.measured} posts measured` : "No metrics yet"} />
        <Stat label="Engagement" value={a.measured ? a.totalEngagement.toLocaleString() : "—"} hint="Likes, comments, shares, saves, clicks" />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          {quick.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={btn("secondary")}>
              <Icon size={16} /> {label}
            </Link>
          ))}
          <PlanButtons platforms={profile.preferredPlatforms} language={profile.preferredLanguage} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Waiting for your approval</h2>
            <Link href="/library?status=WAITING_FOR_APPROVAL" className="text-sm text-primary">
              View all
            </Link>
          </div>
          {waiting.length ? (
            <ul className="divide-y divide-border">
              {waiting.map((i) => (
                <li key={i.id}>
                  <Link href={`/library/${i.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <PlatformIcon platform={i.platform} />
                    <span className="min-w-0 flex-1 truncate text-sm">{i.hook || i.title}</span>
                    <span className="text-xs font-semibold text-approve">Review →</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">You&apos;re all caught up.</p>
          )}
          {failed.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-semibold text-danger">Publishing failed</h3>
              <ul className="space-y-1">
                {failed.map((i) => (
                  <li key={i.id}>
                    <Link href={`/library/${i.id}`} className="flex items-center gap-2 text-sm">
                      <PlatformIcon platform={i.platform} size={16} /> <span className="truncate">{i.hook || i.title}</span>
                      <span className="ml-auto truncate text-xs text-muted">{i.lastError}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Upcoming</h2>
            {upcoming.length ? (
              <ul className="space-y-2.5">
                {upcoming.map((i) => (
                  <li key={i.id}>
                    <Link href={`/library/${i.id}`} className="flex items-center gap-2 text-sm">
                      <PlatformIcon platform={i.platform} size={18} />
                      <span className="min-w-0 flex-1 truncate">{i.hook || i.title}</span>
                      <StatusBadge status={i.status} />
                    </Link>
                    <p className="ml-7 text-xs text-muted">{formatLocal(i.scheduledAt, i.timezone || s.timezone)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing scheduled.</p>
            )}
          </Card>
          {steps.some((x) => !x.done) && (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Get started</h2>
              <ul className="space-y-2 text-sm">
                {steps.map((x) => (
                  <li key={x.label}>
                    <Link href={x.href} className="flex items-center gap-2">
                      {x.done ? <CheckCircle2 size={16} className="text-approve" /> : <Circle size={16} className="text-muted" />}
                      <span className={x.done ? "text-muted line-through" : ""}>{x.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { listNotifications, getSettings } from "@/lib/repo/misc";
import { Card, Empty, PageHeader } from "@/components/ui";
import { formatLocal } from "@/lib/time";
import { MarkRead } from "./mark";

export const metadata = { title: "Notifications" };

const ICON: Record<string, string> = { published: "🟢", publish_failed: "🔴", approval: "🟡", approved: "✅", scheduled: "⏰", account: "🔑", analytics: "📊", generating: "✨" };

export default function NotificationsPage() {
  const list = listNotifications(200);
  const tz = getSettings().timezone;
  return (
    <div>
      <PageHeader title="Notifications" actions={list.some((n) => !n.read) ? <MarkRead /> : null} />
      {list.length === 0 ? (
        <Empty title="No notifications yet" />
      ) : (
        <Card className="divide-y divide-border">
          {list.map((n) => {
            const body = (
              <div className={`flex gap-3 p-3 ${n.read ? "opacity-70" : ""}`}>
                <span className="text-lg">{ICON[n.type] ?? "•"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-sm text-muted">{n.body}</p>
                  <p className="text-[11px] text-muted">{formatLocal(n.createdAt, tz)}</p>
                </div>
                {!n.read && <span className="mt-1 h-2 w-2 rounded-full bg-primary" />}
              </div>
            );
            return n.link ? <Link key={n.id} href={n.link} className="block hover:bg-surface-2">{body}</Link> : <div key={n.id}>{body}</div>;
          })}
        </Card>
      )}
    </div>
  );
}

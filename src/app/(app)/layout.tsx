import { connection } from "next/server";
import { AppShell, ToastProvider } from "@/components/shell";
import { unreadCount } from "@/lib/repo/misc";
import { aiConfigured } from "@/lib/ai/client";
import { authRequired } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <ToastProvider>
      <AppShell unread={unreadCount()} aiReady={aiConfigured()} authOn={authRequired()}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}

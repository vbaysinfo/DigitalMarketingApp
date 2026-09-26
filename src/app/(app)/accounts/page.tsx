import { listAccounts } from "@/lib/repo/accounts";
import { platformConfigured } from "@/lib/platforms";
import { API_VERSIONS, credsEnvNames, redirectUri } from "@/lib/platforms/config";
import { Card, PageHeader, PlatformIcon, btn } from "@/components/ui";
import { AccountActions } from "./actions";
import { PLATFORMS, PLATFORM_LABEL } from "@/lib/types";
import { formatLocal } from "@/lib/time";
import { getSettings } from "@/lib/repo/misc";

export const metadata = { title: "Social Accounts" };

const NOTES: Record<string, string> = {
  linkedin: `Official OAuth + Posts API (LinkedIn-Version ${API_VERSIONS.linkedin}). Personal profile uses w_member_social; Company Pages need w_organization_social and an admin/content-admin role on the page.`,
  facebook: `Meta Graph API ${API_VERSIONS.meta}: publishes to Facebook Pages you manage.`,
  instagram: `Meta Graph API ${API_VERSIONS.meta}: Instagram professional accounts linked to a Facebook Page. Requires APP_BASE_URL to be publicly reachable (Instagram fetches media).`,
  youtube: "YouTube Data API v3 (Google OAuth): uploads videos and Shorts.",
  x: "X API v2 with OAuth 2.0 (PKCE): posts, images and video.",
  tiktok: "TikTok Content Posting API (direct post). Unaudited apps can only post privately.",
  pinterest: "Pinterest API v5: creates Pins on your boards.",
};

export default async function AccountsPage(props: PageProps<"/accounts">) {
  const sp = await props.searchParams;
  const accounts = listAccounts();
  const tz = getSettings().timezone;
  return (
    <div>
      <PageHeader title="Social Accounts" subtitle="Connect with each platform's official login. Tokens are encrypted and never shown in the browser." />
      {typeof sp.error === "string" && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{sp.error}</p>}
      {typeof sp.connected === "string" && <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">🟢 {PLATFORM_LABEL[sp.connected as keyof typeof PLATFORM_LABEL] ?? sp.connected} connected.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {PLATFORMS.map((p) => {
          const accs = accounts.filter((a) => a.platform === p);
          const configured = platformConfigured(p);
          return (
            <Card key={p} className="p-5">
              <div className="flex items-center gap-3">
                <PlatformIcon platform={p} size={32} />
                <div className="flex-1">
                  <p className="font-semibold">{PLATFORM_LABEL[p]}</p>
                  <p className="text-xs">
                    {accs.some((a) => a.status === "connected") ? <span className="text-green-600">🟢 Connected</span> : accs.length ? <span className="text-red-600">🔴 Needs attention</span> : <span className="text-muted">Not connected</span>}
                  </p>
                </div>
                {configured ? (
                  <a href={`/api/oauth/${p}/start`} className={btn(accs.length ? "secondary" : "primary", "sm")}>
                    {accs.length ? "Reconnect" : `CONNECT ${PLATFORM_LABEL[p].toUpperCase()}`}
                  </a>
                ) : (
                  <span className="text-right text-[11px] text-muted">Server setup needed</span>
                )}
              </div>
              <p className="mt-3 text-xs text-muted">{NOTES[p]}</p>
              {!configured && (
                <p className="mt-2 rounded-lg bg-surface-2 p-2 text-[11px] text-muted">
                  Set <code>{credsEnvNames(p).join("</code> and <code>")}</code>. Redirect URL: <code className="break-all">{redirectUri(p)}</code>
                </p>
              )}
              {accs.map((a) => (
                <div key={a.id} className="mt-4 rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{a.accountName}</p>
                    <span className="text-xs">{a.status === "connected" ? "🟢 Connected" : a.status === "expired" ? "🟠 Authorization expired" : "🔴 " + a.status}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    {a.destinations.map((d) => (
                      <li key={d.id} className="flex justify-between gap-2">
                        <span>{d.name}</span>
                        <span className="text-muted">{d.type === "person" ? "Personal profile" : d.type === "organization" ? "Company Page" : d.type} · Connected</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-muted">
                    Connected {formatLocal(a.connectedAt, tz)}
                    {a.expiresAt ? ` · token expires ${formatLocal(a.expiresAt, tz)}` : ""}
                    {a.lastTestedAt ? ` · tested ${formatLocal(a.lastTestedAt, tz)}` : ""}
                  </p>
                  {a.lastError && <p className="mt-1 text-[11px] text-danger">{a.lastError}</p>}
                  <AccountActions id={a.id} platform={p} canReconnect={configured} />
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

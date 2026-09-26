import { getProfile, getSettings } from "@/lib/repo/misc";
import { listMedia } from "@/lib/repo/media";
import { aiConfigured, AI_MODEL } from "@/lib/ai/client";
import { videoRenderingAvailable } from "@/lib/media/video";
import { platformConfigured } from "@/lib/platforms";
import { API_VERSIONS, appBaseUrl } from "@/lib/platforms/config";
import { Card, PageHeader } from "@/components/ui";
import { SettingsForms } from "./forms";
import { PLATFORMS, PLATFORM_LABEL } from "@/lib/types";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  const rows: [string, string, boolean][] = [
    ["AI agent", aiConfigured() ? `Claude (${AI_MODEL})` : "Not configured — set ANTHROPIC_API_KEY", aiConfigured()],
    ["Video rendering", videoRenderingAvailable() ? "ffmpeg available" : "ffmpeg not found (set FFMPEG_PATH)", videoRenderingAvailable()],
    ["Public base URL", appBaseUrl(), !appBaseUrl().includes("localhost")],
    ["LinkedIn API version", API_VERSIONS.linkedin, true],
    ["Meta Graph API version", API_VERSIONS.meta, true],
    ...PLATFORMS.map((p): [string, string, boolean] => [`${PLATFORM_LABEL[p]} app credentials`, platformConfigured(p) ? "Configured" : "Missing", platformConfigured(p)]),
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Business profile, brand voice, AI memory and publishing rules." />
      <SettingsForms profile={getProfile()} settings={getSettings()} library={listMedia()} />
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">System status</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {rows.map(([k, v, ok]) => (
            <li key={k} className="flex justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
              <span>{k}</span>
              <span className={ok ? "text-green-600 dark:text-green-400" : "text-amber-600"}>{v}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Secrets are configured as server environment variables and are never shown here or sent to the AI.</p>
      </Card>
    </div>
  );
}

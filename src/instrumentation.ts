// Starts the in-process Scheduler Agent (every 60s) and resumes interrupted
// generation jobs when the Node.js server boots. For serverless deployments,
// call GET /api/cron/tick every minute with `Authorization: Bearer $CRON_SECRET` instead.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_INTERNAL_SCHEDULER === "true") return;
  const { schedulerTick, syncMetrics } = await import("./lib/publishing/scheduler");
  const { resumeGenerating } = await import("./lib/generation");
  const g = globalThis as typeof globalThis & { __smTimer?: NodeJS.Timeout; __smMetrics?: NodeJS.Timeout };
  if (g.__smTimer) return;
  try {
    resumeGenerating();
  } catch (e) {
    console.error("[scheduler] resume failed", e);
  }
  g.__smTimer = setInterval(() => {
    schedulerTick().catch((e) => console.error("[scheduler] tick failed", e));
  }, 60_000);
  g.__smMetrics = setInterval(() => {
    syncMetrics().catch((e) => console.error("[scheduler] metrics sync failed", e));
  }, 6 * 3600_000);
}

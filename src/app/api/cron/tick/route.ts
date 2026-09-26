import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { schedulerTick, syncMetrics } from "@/lib/publishing/scheduler";

// External trigger for the Scheduler Agent (e.g. a platform cron every minute).
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await schedulerTick();
  const metrics = new URL(req.url).searchParams.get("metrics") === "1" ? await syncMetrics() : undefined;
  return NextResponse.json({ ok: true, ...result, metrics });
}

export const GET = handle;
export const POST = handle;

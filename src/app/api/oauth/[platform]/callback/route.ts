import { NextResponse } from "next/server";
import { adapter } from "@/lib/platforms";
import { consumeOAuthState, upsertAccount } from "@/lib/repo/accounts";
import { notify } from "@/lib/repo/misc";
import { PLATFORM_LABEL, PLATFORMS, type Platform } from "@/lib/types";

export async function GET(req: Request, ctx: RouteContext<"/api/oauth/[platform]/callback">) {
  const { platform } = await ctx.params;
  const back = new URL("/accounts", req.url);
  if (!PLATFORMS.includes(platform as Platform)) return NextResponse.redirect(back);
  const p = platform as Platform;
  const q = new URL(req.url).searchParams;
  const err = q.get("error_description") || q.get("error");
  if (err) {
    back.searchParams.set("error", `${PLATFORM_LABEL[p]}: ${err}`);
    return NextResponse.redirect(back);
  }
  const state = q.get("state") ?? "";
  const code = q.get("code") ?? "";
  const saved = consumeOAuthState(state, p);
  if (!saved || !code) {
    back.searchParams.set("error", "Invalid or expired authorization request. Please try again.");
    return NextResponse.redirect(back);
  }
  try {
    const r = await adapter(p).exchange(code, saved.codeVerifier);
    const acc = upsertAccount({ platform: p, ...r });
    notify("account", `${PLATFORM_LABEL[p]} connected`, `${acc.accountName}: ${acc.destinations.map((d) => d.name).join(", ")}`, "/accounts");
    back.searchParams.set("connected", p);
  } catch (e) {
    back.searchParams.set("error", `${PLATFORM_LABEL[p]}: ${(e as Error).message}`);
  }
  return NextResponse.redirect(back);
}

import { NextResponse } from "next/server";
import { adapter, pkceChallenge, platformConfigured } from "@/lib/platforms";
import { credsEnvNames } from "@/lib/platforms/config";
import { saveOAuthState } from "@/lib/repo/accounts";
import { randomToken } from "@/lib/crypto";
import { PLATFORMS, type Platform } from "@/lib/types";

export async function GET(req: Request, ctx: RouteContext<"/api/oauth/[platform]/start">) {
  const { platform } = await ctx.params;
  if (!PLATFORMS.includes(platform as Platform)) return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  const p = platform as Platform;
  if (!platformConfigured(p)) {
    const url = new URL("/accounts", req.url);
    url.searchParams.set("error", `${p} is not configured. Set ${credsEnvNames(p).join(" and ")} on the server.`);
    return NextResponse.redirect(url);
  }
  const a = adapter(p);
  const state = randomToken(24);
  const verifier = a.usesPkce ? randomToken(48) : null;
  saveOAuthState(state, p, verifier);
  return NextResponse.redirect(a.authorizeUrl(state, verifier ? pkceChallenge(verifier) : null));
}

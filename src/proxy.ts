import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authRequired, verifySession } from "@/lib/session";

// Protects every page and API route. Public exceptions: login, signed media URLs
// (verified in the route), and the cron endpoint (verified with CRON_SECRET).
export function proxy(req: NextRequest) {
  if (!authRequired()) return NextResponse.next();
  if (verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/media/public|api/cron|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};

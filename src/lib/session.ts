// Session token helpers shared by proxy.ts and the login action.
// Token format: `${expiresAtEpochSec}.${hmacSha256(expiresAt)}` in an HttpOnly cookie.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sm_session";
export const SESSION_TTL_SEC = 7 * 24 * 3600;

function key(): Buffer {
  const raw = process.env.SESSION_SECRET;
  if (!raw && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production.");
  return createHash("sha256").update(raw || "dev-only-session-secret").digest();
}

export function signSession(now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SEC;
  return `${exp}.${createHmac("sha256", key()).update(`session:${exp}`).digest("base64url")}`;
}

export function verifySession(token: string | undefined | null): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) * 1000 < Date.now()) return false;
  const expected = createHmac("sha256", key()).update(`session:${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Auth is required whenever APP_PASSWORD is set, and always in production. */
export function authRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD) || process.env.NODE_ENV === "production";
}

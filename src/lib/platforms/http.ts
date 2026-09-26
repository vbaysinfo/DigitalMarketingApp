import "server-only";

// Small HTTP helper for platform APIs: validates responses, never logs tokens.

export class PlatformError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
    public detail: string | null = null,
    public authProblem = false,
  ) {
    super(message);
  }
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const e = b.error as Record<string, unknown> | string | undefined;
  if (typeof e === "string") return (b.error_description as string) || e;
  if (e && typeof e === "object") return (e.message as string) || (e.error_user_msg as string) || JSON.stringify(e).slice(0, 300);
  if (typeof b.message === "string") return b.message;
  if (typeof b.detail === "string") return b.detail;
  if (Array.isArray(b.errors) && b.errors.length) return JSON.stringify(b.errors[0]).slice(0, 300);
  return null;
}

export async function call(
  url: string,
  init: RequestInit & { json?: unknown; expect?: number[] } = {},
): Promise<{ status: number; headers: Headers; body: unknown }> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, body, signal: init.signal ?? AbortSignal.timeout(120_000) });
  } catch (e) {
    throw new PlatformError(`Network error contacting ${new URL(url).host}: ${(e as Error).message}`);
  }
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  const ok = init.expect ? init.expect.includes(res.status) : res.ok;
  if (!ok) {
    const msg = extractMessage(parsed) || (typeof parsed === "string" ? parsed.slice(0, 300) : `HTTP ${res.status}`);
    throw new PlatformError(msg, res.status, typeof text === "string" ? text.slice(0, 1500) : null, res.status === 401 || res.status === 403);
  }
  return { status: res.status, headers: res.headers, body: parsed };
}

export function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...extra };
}

export function form(data: Record<string, string>): URLSearchParams {
  return new URLSearchParams(data);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

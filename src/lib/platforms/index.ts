import "server-only";
import { createHash } from "node:crypto";
import { linkedin } from "./linkedin";
import { facebook, instagram } from "./meta";
import { pinterest, tiktok, x, youtube } from "./others";
import { creds } from "./config";
import type { PlatformAdapter } from "./types";
import type { Platform } from "../types";

// Each platform has its own adapter because publishing requirements differ.
export const ADAPTERS: Record<Platform, PlatformAdapter> = { linkedin, instagram, facebook, youtube, x, tiktok, pinterest };

export function adapter(p: Platform): PlatformAdapter {
  return ADAPTERS[p];
}

export function platformConfigured(p: Platform): boolean {
  return creds(p) !== null;
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

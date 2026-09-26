import "server-only";
import type { Platform } from "../types";

// Centralised API version configuration. Update here when platforms release new versions.
export const API_VERSIONS = {
  /** LinkedIn Marketing/Community Management API version header (YYYYMM). */
  linkedin: process.env.LINKEDIN_API_VERSION || "202608",
  /** Meta Graph API version used for Facebook Pages and Instagram. */
  meta: process.env.META_GRAPH_VERSION || "v24.0",
};

/** Endpoint bases (overridable for sandbox / integration testing only). */
export const LINKEDIN_OAUTH_BASE = () => (process.env.LINKEDIN_OAUTH_BASE || "https://www.linkedin.com").replace(/\/$/, "");
export const LINKEDIN_API_BASE = () => (process.env.LINKEDIN_API_BASE || "https://api.linkedin.com").replace(/\/$/, "");

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function redirectUri(p: Platform): string {
  return `${appBaseUrl()}/api/oauth/${p}/callback`;
}

type Creds = { clientId: string; clientSecret: string };

const ENV: Record<Platform, [string, string]> = {
  linkedin: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  facebook: ["META_APP_ID", "META_APP_SECRET"],
  instagram: ["META_APP_ID", "META_APP_SECRET"],
  youtube: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  x: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  pinterest: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
};

export function creds(p: Platform): Creds | null {
  const [a, b] = ENV[p];
  const clientId = process.env[a];
  const clientSecret = process.env[b];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function credsEnvNames(p: Platform): string[] {
  return ENV[p];
}

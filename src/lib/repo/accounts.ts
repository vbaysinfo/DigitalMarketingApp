import "server-only";
import { db, newId, nowIso, parseJson } from "../db";
import { decrypt, encrypt } from "../crypto";
import type { Destination, Platform, SocialAccountPublic } from "../types";

// Secrets are stored as one encrypted JSON blob per account and are only ever
// decrypted inside server-side publishing code. The public shape never includes them.

export type AccountSecrets = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  /** Per-destination tokens (e.g. Facebook Page access tokens), keyed by destination id. */
  destinationTokens?: Record<string, string>;
  /** Extra per-destination data (e.g. the Page id that owns an Instagram account). */
  meta?: Record<string, string>;
};

type Row = Record<string, unknown>;

function toPublic(r: Row): SocialAccountPublic {
  return {
    id: r.id as string,
    platform: r.platform as Platform,
    accountName: r.account_name as string,
    externalId: r.external_id as string,
    destinations: parseJson<Destination[]>(r.destinations, []),
    scopes: parseJson<string[]>(r.scopes, []),
    status: r.status as SocialAccountPublic["status"],
    expiresAt: (r.expires_at as string) ?? null,
    connectedAt: r.connected_at as string,
    lastTestedAt: (r.last_tested_at as string) ?? null,
    lastError: (r.last_error as string) ?? null,
  };
}

export function listAccounts(): SocialAccountPublic[] {
  return (db().prepare("SELECT * FROM social_accounts ORDER BY platform, connected_at").all() as Row[]).map(toPublic);
}

export function getAccount(id: string): SocialAccountPublic | null {
  const r = db().prepare("SELECT * FROM social_accounts WHERE id = ?").get(id) as Row | undefined;
  return r ? toPublic(r) : null;
}

export function accountsForPlatform(p: Platform): SocialAccountPublic[] {
  return listAccounts().filter((a) => a.platform === p);
}

/** Server-only: decrypted credentials for publishing. Never pass to a client component. */
export function getSecrets(id: string): AccountSecrets {
  const r = db().prepare("SELECT secrets_enc FROM social_accounts WHERE id = ?").get(id) as
    | { secrets_enc: string }
    | undefined;
  if (!r) throw new Error("Account not found");
  return JSON.parse(decrypt(r.secrets_enc)) as AccountSecrets;
}

export function upsertAccount(input: {
  platform: Platform;
  accountName: string;
  externalId: string;
  destinations: Destination[];
  scopes: string[];
  secrets: AccountSecrets;
  expiresAt: string | null;
}): SocialAccountPublic {
  const existing = db()
    .prepare("SELECT id FROM social_accounts WHERE platform = ? AND external_id = ?")
    .get(input.platform, input.externalId) as { id: string } | undefined;
  const enc = encrypt(JSON.stringify(input.secrets));
  if (existing) {
    db()
      .prepare(
        `UPDATE social_accounts SET account_name = ?, destinations = ?, secrets_enc = ?, scopes = ?, status = 'connected',
         expires_at = ?, connected_at = ?, last_error = NULL WHERE id = ?`,
      )
      .run(
        input.accountName,
        JSON.stringify(input.destinations),
        enc,
        JSON.stringify(input.scopes),
        input.expiresAt,
        nowIso(),
        existing.id,
      );
    return getAccount(existing.id)!;
  }
  const id = newId("acc");
  db()
    .prepare(
      `INSERT INTO social_accounts (id, platform, account_name, external_id, destinations, secrets_enc, scopes, status, expires_at, connected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?)`,
    )
    .run(
      id,
      input.platform,
      input.accountName,
      input.externalId,
      JSON.stringify(input.destinations),
      enc,
      JSON.stringify(input.scopes),
      input.expiresAt,
      nowIso(),
    );
  return getAccount(id)!;
}

export function updateSecrets(id: string, secrets: AccountSecrets, expiresAt: string | null): void {
  db()
    .prepare("UPDATE social_accounts SET secrets_enc = ?, expires_at = ?, status = 'connected', last_error = NULL WHERE id = ?")
    .run(encrypt(JSON.stringify(secrets)), expiresAt, id);
}

export function setAccountStatus(id: string, status: SocialAccountPublic["status"], error: string | null = null): void {
  db()
    .prepare("UPDATE social_accounts SET status = ?, last_error = ?, last_tested_at = ? WHERE id = ?")
    .run(status, error, nowIso(), id);
}

export function deleteAccount(id: string): void {
  db().prepare("DELETE FROM social_accounts WHERE id = ?").run(id);
}

export function isConnected(a: SocialAccountPublic | null): boolean {
  if (!a || a.status !== "connected") return false;
  if (a.expiresAt && new Date(a.expiresAt).getTime() < Date.now()) return false;
  return true;
}

// OAuth state (CSRF protection + PKCE verifier), single use, 15 min lifetime.
export function saveOAuthState(state: string, platform: Platform, codeVerifier: string | null): void {
  db().prepare("DELETE FROM oauth_states WHERE created_at < ?").run(new Date(Date.now() - 15 * 60_000).toISOString());
  db()
    .prepare("INSERT INTO oauth_states (state, platform, code_verifier, created_at) VALUES (?, ?, ?, ?)")
    .run(state, platform, codeVerifier, nowIso());
}

export function consumeOAuthState(state: string, platform: Platform): { codeVerifier: string | null } | null {
  const r = db()
    .prepare("SELECT * FROM oauth_states WHERE state = ? AND platform = ? AND created_at >= ?")
    .get(state, platform, new Date(Date.now() - 15 * 60_000).toISOString()) as Row | undefined;
  db().prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  return r ? { codeVerifier: (r.code_verifier as string) ?? null } : null;
}

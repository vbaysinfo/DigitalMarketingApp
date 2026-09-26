import "server-only";
import type { AccountSecrets } from "../repo/accounts";
import type { ContentItem, Destination, MediaAsset, Platform, SocialAccountPublic } from "../types";

export type ConnectResult = {
  accountName: string;
  externalId: string;
  destinations: Destination[];
  scopes: string[];
  secrets: AccountSecrets;
  expiresAt: string | null;
};

export type PublishMedia = {
  asset: MediaAsset;
  data: Buffer;
  /** Short-lived signed public URL (for APIs that pull media, e.g. Instagram). */
  publicUrl: (opts?: { jpeg?: boolean }) => string;
};

export type PublishContext = {
  item: ContentItem;
  caption: string; // final composed caption
  account: SocialAccountPublic;
  secrets: AccountSecrets;
  destination: Destination;
  media: PublishMedia[];
};

export type PublishResult = { postId: string; url: string | null; detail?: string };

export interface PlatformAdapter {
  platform: Platform;
  usesPkce: boolean;
  /** Scopes requested at connect time. */
  scopes(): string[];
  authorizeUrl(state: string, codeChallenge: string | null): string;
  exchange(code: string, codeVerifier: string | null): Promise<ConnectResult>;
  refresh?(secrets: AccountSecrets): Promise<{ secrets: AccountSecrets; expiresAt: string | null }>;
  /** Throws PlatformError if the connection or permissions are not valid. */
  test(account: SocialAccountPublic, secrets: AccountSecrets): Promise<string>;
  /** Must only resolve after the platform confirms the post exists. */
  publish(ctx: PublishContext): Promise<PublishResult>;
  metrics?(ctx: { item: ContentItem; account: SocialAccountPublic; secrets: AccountSecrets }): Promise<Record<string, number> | null>;
}

export function expiry(expiresInSec: number | undefined | null): string | null {
  return expiresInSec ? new Date(Date.now() + Number(expiresInSec) * 1000).toISOString() : null;
}

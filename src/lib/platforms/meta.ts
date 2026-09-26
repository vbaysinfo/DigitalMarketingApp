import "server-only";
import { API_VERSIONS, creds, redirectUri } from "./config";
import { PlatformError, call, sleep } from "./http";
import { expiry, type ConnectResult, type PlatformAdapter, type PublishContext } from "./types";
import type { AccountSecrets } from "../repo/accounts";
import type { Destination, Platform } from "../types";

// Facebook Pages + Instagram (professional accounts) via the official Meta Graph API.
// One Meta login is used; Facebook destinations are Pages (with Page access tokens),
// Instagram destinations are the IG professional accounts linked to those Pages.

const graph = () => `https://graph.facebook.com/${API_VERSIONS.meta}`;
const graphVideo = () => `https://graph-video.facebook.com/${API_VERSIONS.meta}`;

const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights", "business_management"];
const IG_SCOPES = ["instagram_basic", "instagram_content_publish", "instagram_manage_insights", "pages_show_list", "pages_read_engagement", "business_management"];

function authorizeUrl(p: Platform, state: string, scopes: string[]): string {
  const c = creds(p)!;
  const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri(p), state, scope: scopes.join(","), response_type: "code" });
  return `https://www.facebook.com/${API_VERSIONS.meta}/dialog/oauth?${q}`;
}

async function exchangeUserToken(p: Platform, code: string): Promise<{ token: string; expiresAt: string | null }> {
  const c = creds(p)!;
  const short = await call(
    `${graph()}/oauth/access_token?${new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri(p), code })}`,
  );
  const st = (short.body as { access_token: string }).access_token;
  const long = await call(
    `${graph()}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: c.clientId, client_secret: c.clientSecret, fb_exchange_token: st })}`,
  );
  const lt = long.body as { access_token: string; expires_in?: number };
  return { token: lt.access_token, expiresAt: expiry(lt.expires_in) };
}

type Page = { id: string; name: string; access_token: string; tasks?: string[]; instagram_business_account?: { id: string; username?: string } };

async function listPages(userToken: string): Promise<Page[]> {
  const r = await call(
    `${graph()}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token,tasks,instagram_business_account{id,username}", limit: "100", access_token: userToken })}`,
  );
  return (r.body as { data: Page[] }).data ?? [];
}

async function me(userToken: string): Promise<{ id: string; name: string }> {
  const r = await call(`${graph()}/me?fields=id,name&access_token=${encodeURIComponent(userToken)}`);
  return r.body as { id: string; name: string };
}

function destinationToken(secrets: AccountSecrets, destId: string): string {
  const t = secrets.destinationTokens?.[destId];
  if (!t) throw new PlatformError("No access token for this Page. Reconnect the account.", 401, null, true);
  return t;
}

async function multipart(url: string, fields: Record<string, string>, file?: { name: string; data: Buffer; mime: string }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append("source", new Blob([new Uint8Array(file.data)], { type: file.mime }), file.name);
  return call(url, { method: "POST", body: fd, signal: AbortSignal.timeout(600_000) });
}

// ---------------------------------------------------------------------------

export const facebook: PlatformAdapter = {
  platform: "facebook",
  usesPkce: false,
  scopes: () => FB_SCOPES,
  authorizeUrl: (state) => authorizeUrl("facebook", state, FB_SCOPES),
  async exchange(code): Promise<ConnectResult> {
    const { token, expiresAt } = await exchangeUserToken("facebook", code);
    const u = await me(token);
    const pages = (await listPages(token)).filter((p) => !p.tasks || p.tasks.includes("CREATE_CONTENT") || p.tasks.includes("MANAGE"));
    if (!pages.length) throw new PlatformError("No Facebook Pages with content-creation access were found for this account.");
    const destinationTokens: Record<string, string> = {};
    const destinations: Destination[] = pages.map((p) => {
      destinationTokens[p.id] = p.access_token;
      return { id: p.id, name: p.name, type: "page" };
    });
    return { accountName: u.name, externalId: u.id, destinations, scopes: FB_SCOPES, secrets: { accessToken: token, destinationTokens }, expiresAt };
  },
  async test(account, secrets) {
    await me(secrets.accessToken);
    const pages = await listPages(secrets.accessToken);
    const missing = account.destinations.filter((d) => !pages.some((p) => p.id === d.id));
    return missing.length ? `Connected. Lost access to: ${missing.map((m) => m.name).join(", ")}` : `Connected. Pages: ${account.destinations.map((d) => d.name).join(", ")}`;
  },
  async publish(ctx: PublishContext) {
    const page = ctx.destination.id;
    const token = destinationToken(ctx.secrets, page);
    const videos = ctx.media.filter((m) => m.asset.mime.startsWith("video/"));
    const images = ctx.media.filter((m) => m.asset.mime.startsWith("image/"));
    if (videos.length) {
      const r = await multipart(`${graphVideo()}/${page}/videos`, { access_token: token, description: ctx.caption, title: ctx.item.title.slice(0, 250) }, {
        name: videos[0].asset.name,
        data: videos[0].data,
        mime: videos[0].asset.mime,
      });
      const id = (r.body as { id?: string }).id;
      if (!id) throw new PlatformError("Facebook did not return a video ID.");
      return { postId: id, url: `https://www.facebook.com/${page}/videos/${id}` };
    }
    if (images.length > 1) {
      const ids: string[] = [];
      for (const img of images.slice(0, 10)) {
        const r = await multipart(`${graph()}/${page}/photos`, { access_token: token, published: "false" }, { name: img.asset.name, data: img.data, mime: img.asset.mime });
        ids.push((r.body as { id: string }).id);
      }
      const body = new URLSearchParams({ access_token: token, message: ctx.caption });
      ids.forEach((id, i) => body.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
      const r = await call(`${graph()}/${page}/feed`, { method: "POST", body });
      const id = (r.body as { id?: string }).id;
      if (!id) throw new PlatformError("Facebook did not return a post ID.");
      return { postId: id, url: `https://www.facebook.com/${id}` };
    }
    if (images.length === 1) {
      const r = await multipart(`${graph()}/${page}/photos`, { access_token: token, caption: ctx.caption }, { name: images[0].asset.name, data: images[0].data, mime: images[0].asset.mime });
      const b = r.body as { id?: string; post_id?: string };
      const id = b.post_id ?? b.id;
      if (!id) throw new PlatformError("Facebook did not return a post ID.");
      return { postId: id, url: `https://www.facebook.com/${id}` };
    }
    const body = new URLSearchParams({ access_token: token, message: ctx.caption });
    if (ctx.item.link) body.set("link", ctx.item.link);
    const r = await call(`${graph()}/${page}/feed`, { method: "POST", body });
    const id = (r.body as { id?: string }).id;
    if (!id) throw new PlatformError("Facebook did not return a post ID.");
    return { postId: id, url: `https://www.facebook.com/${id}` };
  },
  async metrics({ item, secrets }) {
    if (!item.platformPostId || !item.destinationId) return null;
    const token = secrets.destinationTokens?.[item.destinationId];
    if (!token) return null;
    const out: Record<string, number> = {};
    try {
      const r = await call(
        `${graph()}/${item.platformPostId}?${new URLSearchParams({ fields: "reactions.summary(true).limit(0),comments.summary(true).limit(0),shares", access_token: token })}`,
      );
      const b = r.body as { reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } };
      if (b.reactions?.summary?.total_count !== undefined) out.likes = b.reactions.summary.total_count;
      if (b.comments?.summary?.total_count !== undefined) out.comments = b.comments.summary.total_count;
      if (b.shares?.count !== undefined) out.shares = b.shares.count;
    } catch {
      /* ignore */
    }
    try {
      const r = await call(
        `${graph()}/${item.platformPostId}/insights?${new URLSearchParams({ metric: "post_impressions,post_impressions_unique,post_clicks", access_token: token })}`,
      );
      for (const m of (r.body as { data?: { name: string; values: { value: number }[] }[] }).data ?? []) {
        const v = m.values?.[0]?.value;
        if (typeof v !== "number") continue;
        if (m.name === "post_impressions") out.impressions = v;
        if (m.name === "post_impressions_unique") out.reach = v;
        if (m.name === "post_clicks") out.clicks = v;
      }
    } catch {
      /* insights need read_insights */
    }
    return Object.keys(out).length ? out : null;
  },
};

// ---------------------------------------------------------------------------

async function waitContainer(id: string, token: string): Promise<void> {
  for (let i = 0; i < 90; i++) {
    const r = await call(`${graph()}/${id}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    const b = r.body as { status_code?: string; status?: string };
    if (b.status_code === "FINISHED" || b.status_code === "PUBLISHED") return;
    if (b.status_code === "ERROR" || b.status_code === "EXPIRED") throw new PlatformError(`Instagram media processing failed: ${b.status ?? b.status_code}`);
    await sleep(4000);
  }
  throw new PlatformError("Instagram media processing timed out.");
}

export const instagram: PlatformAdapter = {
  platform: "instagram",
  usesPkce: false,
  scopes: () => IG_SCOPES,
  authorizeUrl: (state) => authorizeUrl("instagram", state, IG_SCOPES),
  async exchange(code): Promise<ConnectResult> {
    const { token, expiresAt } = await exchangeUserToken("instagram", code);
    const u = await me(token);
    const pages = (await listPages(token)).filter((p) => p.instagram_business_account);
    if (!pages.length) throw new PlatformError("No Instagram professional account linked to your Facebook Pages was found.");
    const destinationTokens: Record<string, string> = {};
    const destinations: Destination[] = pages.map((p) => {
      const ig = p.instagram_business_account!;
      destinationTokens[ig.id] = p.access_token;
      return { id: ig.id, name: ig.username ? `@${ig.username}` : `Instagram (${p.name})`, type: "ig_account" };
    });
    return { accountName: u.name, externalId: u.id, destinations, scopes: IG_SCOPES, secrets: { accessToken: token, destinationTokens }, expiresAt };
  },
  async test(account, secrets) {
    for (const d of account.destinations) {
      await call(`${graph()}/${d.id}?fields=id,username&access_token=${encodeURIComponent(destinationToken(secrets, d.id))}`);
    }
    return `Connected. Accounts: ${account.destinations.map((d) => d.name).join(", ")}`;
  },
  async publish(ctx) {
    const ig = ctx.destination.id;
    const token = destinationToken(ctx.secrets, ig);
    const videos = ctx.media.filter((m) => m.asset.mime.startsWith("video/"));
    const images = ctx.media.filter((m) => m.asset.mime.startsWith("image/"));
    const create = async (params: Record<string, string>) => {
      const r = await call(`${graph()}/${ig}/media`, { method: "POST", body: new URLSearchParams({ ...params, access_token: token }) });
      const id = (r.body as { id?: string }).id;
      if (!id) throw new PlatformError("Instagram did not return a media container ID.");
      return id;
    };
    let container: string;
    if (videos.length) {
      container = await create({ media_type: "REELS", video_url: videos[0].publicUrl(), caption: ctx.caption, share_to_feed: "true" });
      await waitContainer(container, token);
    } else if (images.length > 1) {
      const children: string[] = [];
      for (const img of images.slice(0, 10)) children.push(await create({ image_url: img.publicUrl({ jpeg: true }), is_carousel_item: "true" }));
      for (const c of children) await waitContainer(c, token);
      container = await create({ media_type: "CAROUSEL", children: children.join(","), caption: ctx.caption });
      await waitContainer(container, token);
    } else if (images.length === 1) {
      container = await create({ image_url: images[0].publicUrl({ jpeg: true }), caption: ctx.caption });
      await waitContainer(container, token);
    } else {
      throw new PlatformError("Instagram posts require an image or video.");
    }
    const pub = await call(`${graph()}/${ig}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: container, access_token: token }) });
    const mediaId = (pub.body as { id?: string }).id;
    if (!mediaId) throw new PlatformError("Instagram did not confirm publication.");
    let url: string | null = null;
    try {
      const p = await call(`${graph()}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`);
      url = (p.body as { permalink?: string }).permalink ?? null;
    } catch {
      /* permalink optional */
    }
    return { postId: mediaId, url };
  },
  async metrics({ item, secrets }) {
    if (!item.platformPostId || !item.destinationId) return null;
    const token = secrets.destinationTokens?.[item.destinationId];
    if (!token) return null;
    const out: Record<string, number> = {};
    try {
      const r = await call(`${graph()}/${item.platformPostId}?fields=like_count,comments_count&access_token=${encodeURIComponent(token)}`);
      const b = r.body as { like_count?: number; comments_count?: number };
      if (b.like_count !== undefined) out.likes = b.like_count;
      if (b.comments_count !== undefined) out.comments = b.comments_count;
    } catch {
      /* ignore */
    }
    try {
      const r = await call(`${graph()}/${item.platformPostId}/insights?metric=reach,saved,shares,views&access_token=${encodeURIComponent(token)}`);
      for (const m of (r.body as { data?: { name: string; values: { value: number }[] }[] }).data ?? []) {
        const v = m.values?.[0]?.value;
        if (typeof v !== "number") continue;
        if (m.name === "reach") out.reach = v;
        if (m.name === "saved") out.saves = v;
        if (m.name === "shares") out.shares = v;
        if (m.name === "views") out.views = v;
      }
    } catch {
      /* needs instagram_manage_insights */
    }
    return Object.keys(out).length ? out : null;
  },
};

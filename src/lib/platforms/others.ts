import "server-only";
import { creds, redirectUri } from "./config";
import { PlatformError, bearer, call, form, sleep } from "./http";
import { expiry, type PlatformAdapter } from "./types";

// YouTube (Data API v3), X (API v2), TikTok (Content Posting API), Pinterest (API v5).
// Each adapter uses the platform's official OAuth flow and publishing endpoints.

const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;

// ============================== YouTube ==============================

const YT_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

export const youtube: PlatformAdapter = {
  platform: "youtube",
  usesPkce: true,
  scopes: () => YT_SCOPES,
  authorizeUrl(state, challenge) {
    const c = creds("youtube")!;
    const q = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: redirectUri("youtube"),
      response_type: "code",
      scope: YT_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: challenge!,
      code_challenge_method: "S256",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },
  async exchange(code, verifier) {
    const c = creds("youtube")!;
    const t = (
      await call("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: form({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri("youtube"), grant_type: "authorization_code", code_verifier: verifier! }),
      })
    ).body as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
    const ch = (await call("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: bearer(t.access_token) })).body as {
      items?: { id: string; snippet: { title: string } }[];
    };
    const channel = ch.items?.[0];
    if (!channel) throw new PlatformError("No YouTube channel found for this Google account.");
    return {
      accountName: channel.snippet.title,
      externalId: channel.id,
      destinations: [{ id: channel.id, name: channel.snippet.title, type: "channel" }],
      scopes: t.scope.split(" "),
      secrets: { accessToken: t.access_token, refreshToken: t.refresh_token },
      expiresAt: expiry(t.expires_in),
    };
  },
  async refresh(secrets) {
    if (!secrets.refreshToken) throw new PlatformError("YouTube authorization expired. Please reconnect.", 401, null, true);
    const c = creds("youtube")!;
    const t = (
      await call("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: form({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: secrets.refreshToken, grant_type: "refresh_token" }),
      })
    ).body as { access_token: string; expires_in: number };
    return { secrets: { ...secrets, accessToken: t.access_token }, expiresAt: expiry(t.expires_in) };
  },
  async test(_a, secrets) {
    const r = (await call("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: bearer(secrets.accessToken) })).body as {
      items?: { snippet: { title: string } }[];
    };
    return `Connected to channel ${r.items?.[0]?.snippet.title ?? "?"}`;
  },
  async publish(ctx) {
    const video = ctx.media.find((m) => m.asset.mime.startsWith("video/"));
    if (!video) throw new PlatformError("YouTube requires a video.");
    const isShort = ctx.item.contentType === "short";
    let title = (ctx.item.title || ctx.item.hook).slice(0, 100);
    if (isShort && !/#shorts/i.test(title) && title.length <= 92) title = `${title} #Shorts`;
    const init = await call("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: bearer(ctx.secrets.accessToken, {
        "X-Upload-Content-Type": video.asset.mime,
        "X-Upload-Content-Length": String(video.data.length),
      }),
      json: {
        snippet: {
          title,
          description: ctx.caption.slice(0, 5000),
          tags: ctx.item.keywords.slice(0, 30),
          categoryId: process.env.YOUTUBE_CATEGORY_ID || "22",
        },
        status: { privacyStatus: process.env.YOUTUBE_PRIVACY || "public", selfDeclaredMadeForKids: false },
      },
    });
    const uploadUrl = init.headers.get("location");
    if (!uploadUrl) throw new PlatformError("YouTube did not return an upload session.");
    const up = await call(uploadUrl, {
      method: "PUT",
      headers: bearer(ctx.secrets.accessToken, { "Content-Type": video.asset.mime }),
      body: new Uint8Array(video.data),
      signal: AbortSignal.timeout(30 * 60_000),
    });
    const id = (up.body as { id?: string }).id;
    if (!id) throw new PlatformError("YouTube did not confirm the upload.");
    return { postId: id, url: isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}` };
  },
  async metrics({ item, secrets }) {
    if (!item.platformPostId) return null;
    const r = (await call(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${item.platformPostId}`, { headers: bearer(secrets.accessToken) }))
      .body as { items?: { statistics: Record<string, string> }[] };
    const s = r.items?.[0]?.statistics;
    if (!s) return null;
    const out: Record<string, number> = {};
    if (s.viewCount) out.videoViews = Number(s.viewCount);
    if (s.likeCount) out.likes = Number(s.likeCount);
    if (s.commentCount) out.comments = Number(s.commentCount);
    return out;
  },
};

// ============================== X / Twitter ==============================

const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];

async function xUploadMedia(token: string, data: Buffer, mime: string): Promise<string> {
  if (mime.startsWith("image/")) {
    const fd = new FormData();
    fd.append("media", new Blob([new Uint8Array(data)], { type: mime }), "image");
    fd.append("media_category", "tweet_image");
    const r = await call("https://api.x.com/2/media/upload", { method: "POST", headers: bearer(token), body: fd });
    const id = (r.body as { data?: { id?: string } }).data?.id;
    if (!id) throw new PlatformError("X did not return a media ID.");
    return id;
  }
  const init = await call("https://api.x.com/2/media/upload/initialize", {
    method: "POST",
    headers: bearer(token),
    json: { media_type: mime, total_bytes: data.length, media_category: "tweet_video" },
  });
  const id = (init.body as { data?: { id?: string } }).data?.id;
  if (!id) throw new PlatformError("X did not start the video upload.");
  const CHUNK = 4 * 1024 * 1024;
  for (let i = 0, seg = 0; i < data.length; i += CHUNK, seg++) {
    const fd = new FormData();
    fd.append("media", new Blob([new Uint8Array(data.subarray(i, i + CHUNK))]), "chunk");
    fd.append("segment_index", String(seg));
    await call(`https://api.x.com/2/media/upload/${id}/append`, { method: "POST", headers: bearer(token), body: fd });
  }
  const fin = await call(`https://api.x.com/2/media/upload/${id}/finalize`, { method: "POST", headers: bearer(token) });
  let info = (fin.body as { data?: { processing_info?: { state: string; check_after_secs?: number } } }).data?.processing_info;
  for (let i = 0; info && info.state !== "succeeded" && i < 60; i++) {
    if (info.state === "failed") throw new PlatformError("X could not process the video.");
    await sleep((info.check_after_secs ?? 3) * 1000);
    const st = await call(`https://api.x.com/2/media/upload?command=STATUS&media_id=${id}`, { headers: bearer(token) });
    info = (st.body as { data?: { processing_info?: { state: string; check_after_secs?: number } } }).data?.processing_info;
  }
  return id;
}

export const x: PlatformAdapter = {
  platform: "x",
  usesPkce: true,
  scopes: () => X_SCOPES,
  authorizeUrl(state, challenge) {
    const c = creds("x")!;
    const q = new URLSearchParams({
      response_type: "code",
      client_id: c.clientId,
      redirect_uri: redirectUri("x"),
      scope: X_SCOPES.join(" "),
      state,
      code_challenge: challenge!,
      code_challenge_method: "S256",
    });
    return `https://x.com/i/oauth2/authorize?${q}`;
  },
  async exchange(code, verifier) {
    const c = creds("x")!;
    const t = (
      await call("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: { Authorization: basic(c.clientId, c.clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ code, grant_type: "authorization_code", redirect_uri: redirectUri("x"), code_verifier: verifier!, client_id: c.clientId }),
      })
    ).body as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
    const u = ((await call("https://api.x.com/2/users/me", { headers: bearer(t.access_token) })).body as { data: { id: string; name: string; username: string } }).data;
    return {
      accountName: `@${u.username}`,
      externalId: u.id,
      destinations: [{ id: u.id, name: `@${u.username}`, type: "account" }],
      scopes: t.scope.split(" "),
      secrets: { accessToken: t.access_token, refreshToken: t.refresh_token, meta: { username: u.username } },
      expiresAt: expiry(t.expires_in),
    };
  },
  async refresh(secrets) {
    if (!secrets.refreshToken) throw new PlatformError("X authorization expired. Please reconnect.", 401, null, true);
    const c = creds("x")!;
    const t = (
      await call("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: { Authorization: basic(c.clientId, c.clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ refresh_token: secrets.refreshToken, grant_type: "refresh_token", client_id: c.clientId }),
      })
    ).body as { access_token: string; refresh_token?: string; expires_in: number };
    return { secrets: { ...secrets, accessToken: t.access_token, refreshToken: t.refresh_token ?? secrets.refreshToken }, expiresAt: expiry(t.expires_in) };
  },
  async test(_a, secrets) {
    const u = ((await call("https://api.x.com/2/users/me", { headers: bearer(secrets.accessToken) })).body as { data: { username: string } }).data;
    return `Connected as @${u.username}`;
  },
  async publish(ctx) {
    if (ctx.caption.length > 280) throw new PlatformError(`Post is ${ctx.caption.length} characters; X allows 280.`);
    const mediaIds: string[] = [];
    const vids = ctx.media.filter((m) => m.asset.mime.startsWith("video/"));
    const imgs = ctx.media.filter((m) => m.asset.mime.startsWith("image/"));
    if (vids.length) mediaIds.push(await xUploadMedia(ctx.secrets.accessToken, vids[0].data, vids[0].asset.mime));
    else for (const img of imgs.slice(0, 4)) mediaIds.push(await xUploadMedia(ctx.secrets.accessToken, img.data, img.asset.mime));
    const r = await call("https://api.x.com/2/tweets", {
      method: "POST",
      headers: bearer(ctx.secrets.accessToken),
      json: { text: ctx.caption, ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) },
      expect: [201, 200],
    });
    const id = (r.body as { data?: { id?: string } }).data?.id;
    if (!id) throw new PlatformError("X did not return a post ID.");
    const user = ctx.secrets.meta?.username;
    return { postId: id, url: user ? `https://x.com/${user}/status/${id}` : `https://x.com/i/web/status/${id}` };
  },
  async metrics({ item, secrets }) {
    if (!item.platformPostId) return null;
    const r = (await call(`https://api.x.com/2/tweets/${item.platformPostId}?tweet.fields=public_metrics`, { headers: bearer(secrets.accessToken) })).body as {
      data?: { public_metrics?: Record<string, number> };
    };
    const m = r.data?.public_metrics;
    if (!m) return null;
    return {
      likes: m.like_count ?? 0,
      comments: m.reply_count ?? 0,
      shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
      saves: m.bookmark_count ?? 0,
      ...(m.impression_count !== undefined ? { impressions: m.impression_count } : {}),
    };
  },
};

// ============================== TikTok ==============================

const TT_SCOPES = ["user.info.basic", "video.publish", "video.list"];
const TT = "https://open.tiktokapis.com/v2";

export const tiktok: PlatformAdapter = {
  platform: "tiktok",
  usesPkce: false,
  scopes: () => TT_SCOPES,
  authorizeUrl(state) {
    const c = creds("tiktok")!;
    const q = new URLSearchParams({ client_key: c.clientId, response_type: "code", scope: TT_SCOPES.join(","), redirect_uri: redirectUri("tiktok"), state });
    return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
  },
  async exchange(code) {
    const c = creds("tiktok")!;
    const t = (
      await call(`${TT}/oauth/token/`, {
        method: "POST",
        body: form({ client_key: c.clientId, client_secret: c.clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri("tiktok") }),
      })
    ).body as { access_token: string; refresh_token: string; expires_in: number; open_id: string; scope: string };
    const u = ((await call(`${TT}/user/info/?fields=open_id,display_name,username`, { headers: bearer(t.access_token) })).body as {
      data: { user: { display_name: string; username?: string } };
    }).data.user;
    return {
      accountName: u.display_name,
      externalId: t.open_id,
      destinations: [{ id: t.open_id, name: u.display_name, type: "account" }],
      scopes: t.scope.split(","),
      secrets: { accessToken: t.access_token, refreshToken: t.refresh_token, meta: { username: u.username ?? "" } },
      expiresAt: expiry(t.expires_in),
    };
  },
  async refresh(secrets) {
    const c = creds("tiktok")!;
    const t = (
      await call(`${TT}/oauth/token/`, {
        method: "POST",
        body: form({ client_key: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: secrets.refreshToken ?? "" }),
      })
    ).body as { access_token: string; refresh_token: string; expires_in: number };
    return { secrets: { ...secrets, accessToken: t.access_token, refreshToken: t.refresh_token }, expiresAt: expiry(t.expires_in) };
  },
  async test(_a, secrets) {
    await call(`${TT}/post/publish/creator_info/query/`, { method: "POST", headers: bearer(secrets.accessToken), json: {} });
    return "Connected. Posting permission verified.";
  },
  async publish(ctx) {
    const video = ctx.media.find((m) => m.asset.mime.startsWith("video/"));
    if (!video) throw new PlatformError("TikTok requires a video.");
    const token = ctx.secrets.accessToken;
    const info = ((await call(`${TT}/post/publish/creator_info/query/`, { method: "POST", headers: bearer(token), json: {} })).body as {
      data: { privacy_level_options: string[] };
    }).data;
    const privacy = info.privacy_level_options.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : info.privacy_level_options[0];
    const size = video.data.length;
    const chunk = size <= 64 * 1024 * 1024 ? size : 10 * 1024 * 1024;
    const count = size <= 64 * 1024 * 1024 ? 1 : Math.floor(size / chunk);
    const init = ((await call(`${TT}/post/publish/video/init/`, {
      method: "POST",
      headers: bearer(token),
      json: {
        post_info: { title: ctx.caption.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
        source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunk, total_chunk_count: count },
      },
    })).body as { data: { publish_id: string; upload_url: string } }).data;
    for (let i = 0; i < count; i++) {
      const start = i * chunk;
      const end = i === count - 1 ? size : start + chunk;
      await call(init.upload_url, {
        method: "PUT",
        headers: { "Content-Type": video.asset.mime, "Content-Range": `bytes ${start}-${end - 1}/${size}` },
        body: new Uint8Array(video.data.subarray(start, end)),
        expect: [200, 201, 206],
      });
    }
    for (let i = 0; i < 90; i++) {
      const st = ((await call(`${TT}/post/publish/status/fetch/`, { method: "POST", headers: bearer(token), json: { publish_id: init.publish_id } })).body as {
        data: { status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] };
      }).data;
      if (st.status === "PUBLISH_COMPLETE") {
        const postId = String(st.publicaly_available_post_id?.[0] ?? init.publish_id);
        const user = ctx.secrets.meta?.username;
        return {
          postId,
          url: user && st.publicaly_available_post_id?.length ? `https://www.tiktok.com/@${user}/video/${postId}` : null,
          detail: privacy !== "PUBLIC_TO_EVERYONE" ? `Posted with privacy ${privacy} (app not yet audited for public posting).` : undefined,
        };
      }
      if (st.status === "FAILED") throw new PlatformError(`TikTok publishing failed: ${st.fail_reason ?? "unknown reason"}`);
      await sleep(4000);
    }
    throw new PlatformError("TikTok did not confirm publication in time. Check TikTok before retrying.");
  },
  async metrics({ item, secrets }) {
    if (!item.platformPostId) return null;
    const r = (await call(`${TT}/video/query/?fields=id,like_count,comment_count,share_count,view_count`, {
      method: "POST",
      headers: bearer(secrets.accessToken),
      json: { filters: { video_ids: [item.platformPostId] } },
    })).body as { data?: { videos?: Record<string, number>[] } };
    const v = r.data?.videos?.[0];
    if (!v) return null;
    return { likes: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0, videoViews: v.view_count ?? 0 };
  },
};

// ============================== Pinterest ==============================

const PIN_SCOPES = ["boards:read", "pins:read", "pins:write", "user_accounts:read"];
const PIN = "https://api.pinterest.com/v5";

async function pinBoards(token: string) {
  const r = (await call(`${PIN}/boards?page_size=100`, { headers: bearer(token) })).body as { items?: { id: string; name: string }[] };
  return (r.items ?? []).map((b) => ({ id: b.id, name: b.name, type: "board" }));
}

export const pinterest: PlatformAdapter = {
  platform: "pinterest",
  usesPkce: false,
  scopes: () => PIN_SCOPES,
  authorizeUrl(state) {
    const c = creds("pinterest")!;
    const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri("pinterest"), response_type: "code", scope: PIN_SCOPES.join(","), state });
    return `https://www.pinterest.com/oauth/?${q}`;
  },
  async exchange(code) {
    const c = creds("pinterest")!;
    const t = (
      await call(`${PIN}/oauth/token`, {
        method: "POST",
        headers: { Authorization: basic(c.clientId, c.clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ grant_type: "authorization_code", code, redirect_uri: redirectUri("pinterest") }),
      })
    ).body as { access_token: string; refresh_token: string; expires_in: number; scope: string };
    const u = (await call(`${PIN}/user_account`, { headers: bearer(t.access_token) })).body as { username: string };
    const boards = await pinBoards(t.access_token);
    if (!boards.length) throw new PlatformError("Create at least one Pinterest board, then connect again.");
    return {
      accountName: u.username,
      externalId: u.username,
      destinations: boards,
      scopes: t.scope.split(/[ ,]/),
      secrets: { accessToken: t.access_token, refreshToken: t.refresh_token },
      expiresAt: expiry(t.expires_in),
    };
  },
  async refresh(secrets) {
    const c = creds("pinterest")!;
    const t = (
      await call(`${PIN}/oauth/token`, {
        method: "POST",
        headers: { Authorization: basic(c.clientId, c.clientSecret), "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ grant_type: "refresh_token", refresh_token: secrets.refreshToken ?? "" }),
      })
    ).body as { access_token: string; expires_in: number; refresh_token?: string };
    return { secrets: { ...secrets, accessToken: t.access_token, refreshToken: t.refresh_token ?? secrets.refreshToken }, expiresAt: expiry(t.expires_in) };
  },
  async test(_a, secrets) {
    const b = await pinBoards(secrets.accessToken);
    return `Connected. ${b.length} boards available.`;
  },
  async publish(ctx) {
    const img = ctx.media.find((m) => m.asset.mime.startsWith("image/"));
    if (!img) throw new PlatformError("Pinterest requires an image.");
    const r = await call(`${PIN}/pins`, {
      method: "POST",
      headers: bearer(ctx.secrets.accessToken),
      json: {
        board_id: ctx.destination.id,
        title: (ctx.item.title || ctx.item.hook).slice(0, 100),
        description: ctx.caption.slice(0, 500),
        ...(ctx.item.link ? { link: ctx.item.link } : {}),
        alt_text: (ctx.item.imageConcept || ctx.item.title).slice(0, 500),
        media_source: { source_type: "image_base64", content_type: img.asset.mime === "image/png" ? "image/png" : "image/jpeg", data: img.data.toString("base64") },
      },
      expect: [201, 200],
    });
    const id = (r.body as { id?: string }).id;
    if (!id) throw new PlatformError("Pinterest did not return a Pin ID.");
    return { postId: id, url: `https://www.pinterest.com/pin/${id}/` };
  },
  async metrics({ item, secrets }) {
    if (!item.platformPostId) return null;
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 89 * 86400_000).toISOString().slice(0, 10);
    const r = (await call(
      `${PIN}/pins/${item.platformPostId}/analytics?start_date=${start}&end_date=${end}&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`,
      { headers: bearer(secrets.accessToken) },
    )).body as { all?: { lifetime_metrics?: Record<string, number> } };
    const m = r.all?.lifetime_metrics;
    if (!m) return null;
    return { impressions: m.IMPRESSION ?? 0, saves: m.SAVE ?? 0, clicks: (m.PIN_CLICK ?? 0) + (m.OUTBOUND_CLICK ?? 0) };
  },
};

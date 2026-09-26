import "server-only";
import { API_VERSIONS, LINKEDIN_API_BASE, LINKEDIN_OAUTH_BASE, creds, redirectUri } from "./config";
import { PlatformError, bearer, call, form, sleep } from "./http";
import { expiry, type PlatformAdapter, type PublishContext } from "./types";
import type { Destination } from "../types";

// LinkedIn — official OAuth 2.0 + versioned REST Posts API (not the deprecated UGC Posts API).
//  - Personal posting:      w_member_social (author urn:li:person:{id})
//  - Organization posting:  w_organization_social (+ r_organization_social, rw_organization_admin
//                           to list pages); author urn:li:organization:{id}; the member must hold
//                           an ADMINISTRATOR / CONTENT_ADMINISTRATOR / DIRECT_SPONSORED_CONTENT_POSTER role.
//  - Media is uploaded first (Images / Videos / Documents APIs) and referenced by URN.


const POSTING_ROLES = new Set(["ADMINISTRATOR", "CONTENT_ADMINISTRATOR", "DIRECT_SPONSORED_CONTENT_POSTER"]);

const orgsEnabled = () => process.env.LINKEDIN_ENABLE_ORGANIZATIONS !== "false";

function restHeaders(token: string): Record<string, string> {
  return bearer(token, {
    "LinkedIn-Version": API_VERSIONS.linkedin,
    "X-Restli-Protocol-Version": "2.0.0",
  });
}

/** Escape LinkedIn "little text format" reserved characters and turn #tags into hashtag templates. */
export function toLittleText(text: string): string {
  const escaped = text.replace(/[\\|{}@\[\]()<>*_~#]/g, (c) => `\\${c}`);
  return escaped.replace(/\\#([\p{L}\p{N}_]+)/gu, (_m, tag: string) => `{hashtag|\\#|${tag}}`);
}

async function listOrganizations(token: string): Promise<Destination[]> {
  const out: Destination[] = [];
  let start = 0;
  for (let page = 0; page < 5; page++) {
    const r = await call(`${LINKEDIN_API_BASE()}/rest/organizationAcls?q=roleAssignee&state=APPROVED&start=${start}&count=50`, {
      headers: restHeaders(token),
    });
    const els = ((r.body as { elements?: { organization: string; role: string }[] }).elements ?? []).filter((e) =>
      POSTING_ROLES.has(e.role),
    );
    for (const e of els) {
      if (out.some((d) => d.id === e.organization)) continue;
      const id = e.organization.split(":").pop()!;
      let name = `Organization ${id}`;
      try {
        const o = await call(`${LINKEDIN_API_BASE()}/rest/organizations/${id}`, { headers: restHeaders(token) });
        name = (o.body as { localizedName?: string }).localizedName || name;
      } catch {
        /* name lookup is best-effort */
      }
      out.push({ id: e.organization, name, type: "organization" });
    }
    const total = (r.body as { paging?: { total?: number } }).paging?.total ?? 0;
    start += 50;
    if (start >= total) break;
  }
  return out;
}

async function uploadImage(token: string, owner: string, data: Buffer): Promise<string> {
  const init = await call(`${LINKEDIN_API_BASE()}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: restHeaders(token),
    json: { initializeUploadRequest: { owner } },
  });
  const v = (init.body as { value: { uploadUrl: string; image: string } }).value;
  await call(v.uploadUrl, { method: "PUT", headers: bearer(token), body: new Uint8Array(data), expect: [200, 201] });
  return v.image;
}

async function uploadDocument(token: string, owner: string, data: Buffer): Promise<string> {
  const init = await call(`${LINKEDIN_API_BASE()}/rest/documents?action=initializeUpload`, {
    method: "POST",
    headers: restHeaders(token),
    json: { initializeUploadRequest: { owner } },
  });
  const v = (init.body as { value: { uploadUrl: string; document: string } }).value;
  await call(v.uploadUrl, { method: "PUT", headers: bearer(token), body: new Uint8Array(data), expect: [200, 201] });
  // Wait for processing so the post does not reference an unavailable document.
  for (let i = 0; i < 30; i++) {
    const s = await call(`${LINKEDIN_API_BASE()}/rest/documents/${encodeURIComponent(v.document)}`, { headers: restHeaders(token) });
    const status = (s.body as { status?: string }).status;
    if (status === "AVAILABLE") break;
    if (status === "PROCESSING_FAILED") throw new PlatformError("LinkedIn could not process the document.");
    await sleep(2000);
  }
  return v.document;
}

async function uploadVideo(token: string, owner: string, data: Buffer): Promise<string> {
  const init = await call(`${LINKEDIN_API_BASE()}/rest/videos?action=initializeUpload`, {
    method: "POST",
    headers: restHeaders(token),
    json: { initializeUploadRequest: { owner, fileSizeBytes: data.length, uploadCaptions: false, uploadThumbnail: false } },
  });
  const v = (init.body as {
    value: { video: string; uploadToken: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] };
  }).value;
  const etags: string[] = [];
  for (const part of v.uploadInstructions) {
    const r = await call(part.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(data.subarray(part.firstByte, part.lastByte + 1)),
      expect: [200, 201],
    });
    const etag = r.headers.get("etag");
    if (!etag) throw new PlatformError("LinkedIn video upload did not return an ETag.");
    etags.push(etag);
  }
  await call(`${LINKEDIN_API_BASE()}/rest/videos?action=finalizeUpload`, {
    method: "POST",
    headers: restHeaders(token),
    json: { finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken || "", uploadedPartIds: etags } },
  });
  for (let i = 0; i < 60; i++) {
    const s = await call(`${LINKEDIN_API_BASE()}/rest/videos/${encodeURIComponent(v.video)}`, { headers: restHeaders(token) });
    const status = (s.body as { status?: string }).status;
    if (status === "AVAILABLE") return v.video;
    if (status === "PROCESSING_FAILED") throw new PlatformError("LinkedIn could not process the video.");
    await sleep(3000);
  }
  return v.video; // still processing; LinkedIn will publish once available
}

export const linkedin: PlatformAdapter = {
  platform: "linkedin",
  usesPkce: false,
  scopes() {
    const s = ["openid", "profile", "email", "w_member_social"];
    if (orgsEnabled()) s.push("w_organization_social", "r_organization_social", "rw_organization_admin");
    return s;
  },
  authorizeUrl(state) {
    const c = creds("linkedin")!;
    const q = new URLSearchParams({
      response_type: "code",
      client_id: c.clientId,
      redirect_uri: redirectUri("linkedin"),
      state,
      scope: this.scopes().join(" "),
    });
    return `${LINKEDIN_OAUTH_BASE()}/oauth/v2/authorization?${q}`;
  },
  async exchange(code) {
    const c = creds("linkedin")!;
    const tok = await call(`${LINKEDIN_OAUTH_BASE()}/oauth/v2/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri("linkedin"),
        client_id: c.clientId,
        client_secret: c.clientSecret,
      }),
    });
    const t = tok.body as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
    const me = await call(`${LINKEDIN_API_BASE()}/v2/userinfo`, { headers: bearer(t.access_token) });
    const u = me.body as { sub: string; name?: string; email?: string };
    const person: Destination = { id: `urn:li:person:${u.sub}`, name: `${u.name ?? "Member"} (personal profile)`, type: "person" };
    const scopes = (t.scope ?? this.scopes().join(",")).split(/[ ,]+/).filter(Boolean);
    let orgs: Destination[] = [];
    if (scopes.includes("rw_organization_admin") || scopes.includes("r_organization_admin")) {
      try {
        orgs = await listOrganizations(t.access_token);
      } catch {
        orgs = [];
      }
    }
    return {
      accountName: u.name ?? u.email ?? "LinkedIn member",
      externalId: u.sub,
      destinations: [person, ...orgs],
      scopes,
      secrets: { accessToken: t.access_token, refreshToken: t.refresh_token },
      expiresAt: expiry(t.expires_in),
    };
  },
  async refresh(secrets) {
    if (!secrets.refreshToken) throw new PlatformError("LinkedIn authorization expired. Please reconnect.", 401, null, true);
    const c = creds("linkedin")!;
    const tok = await call(`${LINKEDIN_OAUTH_BASE()}/oauth/v2/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ grant_type: "refresh_token", refresh_token: secrets.refreshToken, client_id: c.clientId, client_secret: c.clientSecret }),
    });
    const t = tok.body as { access_token: string; expires_in: number; refresh_token?: string };
    return { secrets: { ...secrets, accessToken: t.access_token, refreshToken: t.refresh_token ?? secrets.refreshToken }, expiresAt: expiry(t.expires_in) };
  },
  async test(account, secrets) {
    await call(`${LINKEDIN_API_BASE()}/v2/userinfo`, { headers: bearer(secrets.accessToken) });
    if (!account.scopes.includes("w_member_social") && !account.scopes.includes("w_organization_social")) {
      throw new PlatformError("Missing posting permission (w_member_social / w_organization_social). Reconnect LinkedIn.", 403, null, true);
    }
    const orgs = account.destinations.filter((d) => d.type === "organization");
    if (orgs.length && account.scopes.includes("rw_organization_admin")) {
      const current = await listOrganizations(secrets.accessToken);
      const lost = orgs.filter((o) => !current.some((c) => c.id === o.id));
      if (lost.length) return `Connected. Lost posting access to: ${lost.map((l) => l.name).join(", ")}`;
    }
    return `Connected. Destinations: ${account.destinations.map((d) => d.name).join(", ")}`;
  },
  async publish(ctx: PublishContext) {
    const token = ctx.secrets.accessToken;
    const author = ctx.destination.id;
    if (author.startsWith("urn:li:organization:") && !ctx.account.scopes.includes("w_organization_social"))
      throw new PlatformError("Missing w_organization_social permission for Company Page posting.", 403, null, true);
    if (author.startsWith("urn:li:person:") && !ctx.account.scopes.includes("w_member_social"))
      throw new PlatformError("Missing w_member_social permission for personal posting.", 403, null, true);

    let content: Record<string, unknown> | undefined;
    const videos = ctx.media.filter((m) => m.asset.mime.startsWith("video/"));
    const pdfs = ctx.media.filter((m) => m.asset.mime === "application/pdf");
    const images = ctx.media.filter((m) => m.asset.mime.startsWith("image/"));
    const title = (ctx.item.title || ctx.item.topic || "Post").slice(0, 200);
    if (videos.length) {
      const urn = await uploadVideo(token, author, videos[0].data);
      content = { media: { title, id: urn } };
    } else if (pdfs.length) {
      const urn = await uploadDocument(token, author, pdfs[0].data);
      content = { media: { title, id: urn } };
    } else if (images.length > 1) {
      const urns: string[] = [];
      for (const img of images.slice(0, 20)) urns.push(await uploadImage(token, author, img.data));
      content = { multiImage: { images: urns.map((id) => ({ id, altText: title.slice(0, 120) })) } };
    } else if (images.length === 1) {
      const urn = await uploadImage(token, author, images[0].data);
      content = { media: { id: urn, altText: (ctx.item.imageConcept || title).slice(0, 4000) } };
    } else if (ctx.item.link) {
      content = { article: { source: ctx.item.link, title } };
    }

    const res = await call(`${LINKEDIN_API_BASE()}/rest/posts`, {
      method: "POST",
      headers: restHeaders(token),
      json: {
        author,
        commentary: toLittleText(ctx.caption),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        ...(content ? { content } : {}),
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      },
      expect: [201],
    });
    const postId = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id");
    if (!postId) throw new PlatformError("LinkedIn did not return a post ID; publication could not be verified.", res.status);
    return { postId, url: `https://www.linkedin.com/feed/update/${postId}/` };
  },
  async metrics({ item, secrets }) {
    if (!item.platformPostId) return null;
    const out: Record<string, number> = {};
    try {
      const r = await call(`${LINKEDIN_API_BASE()}/rest/socialActions/${encodeURIComponent(item.platformPostId)}`, { headers: restHeaders(secrets.accessToken) });
      const b = r.body as { likesSummary?: { totalLikes?: number }; commentsSummary?: { aggregatedTotalComments?: number } };
      if (b.likesSummary?.totalLikes !== undefined) out.likes = b.likesSummary.totalLikes;
      if (b.commentsSummary?.aggregatedTotalComments !== undefined) out.comments = b.commentsSummary.aggregatedTotalComments;
    } catch {
      /* not available for this post/permission set */
    }
    if (item.destinationId?.startsWith("urn:li:organization:")) {
      try {
        const key = item.platformPostId.includes(":ugcPost:") ? "ugcPosts" : "shares";
        const r = await call(
          `${LINKEDIN_API_BASE()}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(item.destinationId)}&${key}=List(${encodeURIComponent(item.platformPostId)})`,
          { headers: restHeaders(secrets.accessToken) },
        );
        const s = (r.body as { elements?: { totalShareStatistics?: Record<string, number> }[] }).elements?.[0]?.totalShareStatistics;
        if (s) {
          if (s.impressionCount !== undefined) out.impressions = s.impressionCount;
          if (s.uniqueImpressionsCount !== undefined) out.reach = s.uniqueImpressionsCount;
          if (s.clickCount !== undefined) out.clicks = s.clickCount;
          if (s.shareCount !== undefined) out.shares = s.shareCount;
          if (s.likeCount !== undefined) out.likes = s.likeCount;
          if (s.commentCount !== undefined) out.comments = s.commentCount;
          if (s.engagement !== undefined) out.engagementRate = s.engagement;
        }
      } catch {
        /* needs r_organization_social */
      }
    }
    return Object.keys(out).length ? out : null;
  },
};

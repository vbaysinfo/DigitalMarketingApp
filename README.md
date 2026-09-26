# AI Social Media Marketing & Automatic Publishing Agent

An AI agent platform for social media marketing and publishing.

**CREATE → REVIEW → APPROVE → POST → ANALYZE → IMPROVE**

The AI creates, prepares, schedules and publishes content. It never publishes anything the user hasn't approved, and the backend enforces that rule, not only the UI.

Supported platforms: **LinkedIn** (full approval-to-publish flow, personal profile + Company Pages), **Instagram**, **Facebook Pages**, **YouTube**, **X/Twitter**, **TikTok**, **Pinterest**. All use the official OAuth and publishing APIs.

---

## Features

| Area | What it does |
|---|---|
| **AI Marketing Agent (chat)** | Natural-language commands, e.g. "Create today's LinkedIn post", "Create 5 reels", "Create my week", "Make it more professional", "Translate to Telugu + English", "Schedule this for tomorrow at 10 AM", "Show my pending approvals", "Publish all approved posts". |
| **Sub-agents** | Content Strategy, Content Creation, Image Post, Carousel, Video/Reel, Hashtag, CTA, Quality Check, Scheduler, Analytics. |
| **Platform-specific content** | Each platform gets its own rewritten version: LinkedIn professional, Instagram visual, Facebook conversational, YouTube title/description/tags, X concise, TikTok hook-first, Pinterest search-friendly. |
| **Media generation** | Branded post images (brand colors + logo), carousel slides (PNG + a PDF document for LinkedIn), and rendered **MP4 reels/shorts** from the scene plan plus your uploaded images, clips and logo (ffmpeg). |
| **Approval system** | Statuses: IDEA, GENERATING, DRAFT, WAITING_FOR_APPROVAL, APPROVED, SCHEDULED, PUBLISHING, PUBLISHED, PUBLISH_FAILED, CANCELLED. Three modes: manual, approve & schedule, approved-content queue. |
| **Preview & actions** | Platform-styled preview with **EDIT · REGENERATE · SAVE DRAFT · APPROVE & POST · APPROVE & SCHEDULE**. |
| **Calendar** | Month and list views with drag-to-reschedule. **CREATE MY WEEK** (Mon Educational → Sun Engagement) and **CREATE 30 DAYS**. |
| **Quality check** | Length and platform limits, hashtag count and spam filtering, CTA, media requirements and resolution, broken links, unsupported claims, brand emoji rules, duplicates, plus the AI's own self-review. Includes **AI FIX**. |
| **Duplicate protection** | Checks caption similarity, reused image/video and recently published topics. Shows **SIMILAR CONTENT DETECTED** with **USE ANYWAY** or **GENERATE NEW VERSION**. |
| **Error handling** | PUBLISH_FAILED shows the platform, the error and the reason, with **RETRY / EDIT / CANCEL**. A post is marked PUBLISHED only when the platform returns a post ID. |
| **History, analytics, notifications** | Post IDs, URLs and a full event log. Analytics use only real metrics pulled from platform APIs. The AI Analytics Agent finds patterns and suggests new ideas without inventing numbers. |
| **Business profile & AI memory** | Brand voice, custom rules, languages (English, Telugu, Hindi, Telugu + English, Hinglish, Tanglish), preferred platforms, past topics, approved style and performance data. |
| **Media library** | Upload, preview, rename, recategorise, search, delete and reuse. |
| **UI** | Responsive layout for desktop, tablet and mobile, with dark and light mode. |

---

## How the approval rule is enforced

`src/lib/status.ts`:

```text
IF content.status NOT IN (APPROVED, SCHEDULED[=approved+scheduled], PUBLISH_FAILED[retry])  → DO NOT PUBLISH
IF approval is missing                                                                      → DO NOT PUBLISH
IF content changed after approval (hash of the approved payload differs)                    → DO NOT PUBLISH
```

Every publish path goes through `publishContent()` in `src/lib/publishing/publisher.ts`: APPROVE & POST, the scheduler, "publish all approved" and retry. That function:

1. Checks the approval gate.
2. Confirms the account is connected, refreshes the token if needed, and checks permissions and the destination.
3. Runs duplicate protection.
4. Validates content and media.
5. Atomically claims the post (`PUBLISHING`, compare-and-set), so a post can't be published twice.
6. Uploads media and creates the post through the official API.
7. Sets `PUBLISHED` only when the platform returns a post ID, and stores the ID, time and URL. Anything else becomes `PUBLISH_FAILED` with the error.

Editing approved or scheduled content automatically sends it back to **WAITING_FOR_APPROVAL**.

The scheduler runs every minute in-process, or through `GET /api/cron/tick` with `Authorization: Bearer $CRON_SECRET`. It publishes only posts that are `SCHEDULED`, due, approved, unchanged since approval, and on a connected account. Posts stuck in `PUBLISHING` after a crash are marked failed, never assumed published.

## LinkedIn implementation

- OAuth 2.0 authorization-code flow. The user never pastes a token.
- Detects posting destinations: the **personal profile** (`w_member_social`) and every **Company Page** where the member holds ADMINISTRATOR, CONTENT_ADMINISTRATOR or DIRECT_SPONSORED_CONTENT_POSTER (`w_organization_social`, `rw_organization_admin`).
- Uses the current versioned **Posts API** (`/rest/posts`), not the deprecated UGC Posts API. Required headers are `LinkedIn-Version` and `X-Restli-Protocol-Version: 2.0.0`. The version is set in one place: `LINKEDIN_API_VERSION` / `src/lib/platforms/config.ts`.
- Separate media upload flows: Images API (single image and multi-image), Videos API (multipart upload with ETags, then finalize and wait until AVAILABLE), and Documents API (PDF carousels).
- `lifecycleState: "PUBLISHED"`. The post URN is read from the `x-restli-id` header and stored with the post URL.
- Commentary is escaped to LinkedIn's "little text format" (hashtags become hashtag templates).
- Metrics come from `socialActions` (likes and comments) and organization share statistics (impressions, reach, clicks, shares).

## Other platform adapters

Each platform has its own adapter in `src/lib/platforms/`:

- **Facebook**: Pages via Graph API (`/feed`, `/photos`, multi-photo, `/videos`), using Page access tokens.
- **Instagram**: content publishing (image, carousel and Reels containers, then `media_publish`). Instagram fetches the media itself, so the app serves short-lived **HMAC-signed** URLs (JPEG-converted) and needs a public HTTPS `APP_BASE_URL`.
- **YouTube**: resumable upload with the Data API v3 (Shorts get `#Shorts`).
- **X**: API v2 `POST /2/tweets` with media upload v2 (chunked for video), OAuth 2.0 with PKCE.
- **TikTok**: Content Posting API direct post (FILE_UPLOAD with status polling). Apps that haven't passed TikTok's audit can only post privately.
- **Pinterest**: API v5 Pins on the selected board.

## Security

- OAuth everywhere. Access and refresh tokens and Page tokens are **encrypted at rest (AES-256-GCM)**, stay on the server, and are never sent to the browser or included in AI prompts.
- Password login with an HMAC-signed, HttpOnly, SameSite session cookie. `proxy.ts` protects every page and API route.
- OAuth `state` is single-use and expires after 15 minutes. PKCE is used where supported.
- Signed, expiring media URLs for platforms that fetch media. Upload type and size limits are enforced.
- Security headers, an append-only publishing event log, and validated API responses.
- Run behind HTTPS in production (`APP_BASE_URL=https://…`, secure cookies are automatic).

---

## Getting started

Requirements: **Node.js ≥ 22.13** (uses the built-in `node:sqlite`).

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

Without `ANTHROPIC_API_KEY` the app runs in **template mode**, so you can try the whole workflow before configuring AI. Set the key to enable the full Claude-powered agents (default model `claude-opus-5`, with server-side refusal fallbacks enabled).

Connect social accounts from **Social Accounts**. Each platform needs an app and credentials from its developer portal. The exact environment variable names and redirect URLs are listed in `.env.example` and on the Social Accounts page.

### Production

```bash
npm run build
npm start
```

- Put `DATA_DIR` on a **persistent volume** (SQLite database and media files).
- Run a single long-lived Node.js instance (VM, container, Render, Fly, Railway…). The in-process scheduler and background generation queue depend on it.
- On serverless platforms, set `DISABLE_INTERNAL_SCHEDULER=true` and call `/api/cron/tick` every minute from a cron service. Add `?metrics=1` a few times a day to sync analytics.
- Telugu and Devanagari text in generated graphics needs the Noto fonts installed on the server (`fonts-noto-core` on Debian/Ubuntu).

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit tests (approval gate, scheduler rule, state machine, hashtags, duplicates, time zones) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |

## Project structure

```
src/
  proxy.ts                     auth guard (Next.js 16 "proxy", formerly middleware)
  instrumentation.ts           starts the scheduler + resumes generation jobs
  app/
    actions.ts                 server actions (approve, post, schedule, edit, …)
    (app)/…                    dashboard, agent, create, library, calendar, media,
                               accounts, history, analytics, settings, notifications
    api/oauth/[platform]/…     OAuth start + callback
    api/media/…                authenticated + signed media delivery, uploads
    api/cron/tick              external scheduler trigger
  lib/
    status.ts                  approval gate + state machine (unit tested)
    ai/                        Claude client, agents, brand memory, template fallback
    generation.ts              agent pipeline: strategy → creation → media → quality
    agent.ts                   chat orchestration
    media/                     image/carousel rendering (sharp, pdf-lib), video (ffmpeg)
    platforms/                 one adapter per platform + central API versions
    publishing/                publisher, scheduler/queue/metrics, duplicate detection
    quality.ts                 Quality Check Agent
    repo/                      SQLite repositories
```

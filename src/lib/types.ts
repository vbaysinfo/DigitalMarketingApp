// Shared domain types. Pure module: safe to import from client and server.

export const PLATFORMS = [
  "linkedin",
  "instagram",
  "facebook",
  "youtube",
  "x",
  "tiktok",
  "pinterest",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  x: "X / Twitter",
  tiktok: "TikTok",
  pinterest: "Pinterest",
};

export const CONTENT_STATUSES = [
  "IDEA",
  "GENERATING",
  "DRAFT",
  "WAITING_FOR_APPROVAL",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PUBLISH_FAILED",
  "CANCELLED",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const STATUS_LABEL: Record<ContentStatus, string> = {
  IDEA: "Idea",
  GENERATING: "Generating",
  DRAFT: "Draft",
  WAITING_FOR_APPROVAL: "Waiting approval",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  PUBLISH_FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const CONTENT_TYPES = [
  "text",
  "image",
  "carousel",
  "video",
  "reel",
  "short",
  "article",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  text: "Text post",
  image: "Image post",
  carousel: "Carousel",
  video: "Video",
  reel: "Reel",
  short: "Short",
  article: "Article / link",
};

export const CATEGORIES = [
  "Educational",
  "Promotional",
  "Informational",
  "Brand awareness",
  "Product",
  "Service",
  "Customer problem",
  "Customer solution",
  "FAQ",
  "Tips",
  "Industry knowledge",
  "Behind the scenes",
  "Testimonials",
  "Case studies",
  "Before/after",
  "Engagement",
] as const;

export const LANGUAGES = [
  "English",
  "Telugu",
  "Hindi",
  "Telugu + English",
  "Hinglish",
  "Tanglish",
] as const;

export const BRAND_VOICES = [
  "Professional",
  "Friendly",
  "Premium",
  "Corporate",
  "Educational",
  "Casual",
  "Creative",
  "Local business",
  "Promotional",
] as const;

export const VIDEO_STYLES = [
  "Professional",
  "Modern",
  "Corporate",
  "Luxury",
  "Educational",
  "Promotional",
  "Minimal",
  "Fast-paced",
] as const;

export const MEDIA_CATEGORIES = [
  "Images",
  "Videos",
  "Logos",
  "Product Images",
  "Brand Assets",
  "Reels",
  "Thumbnails",
  "Documents",
] as const;

export type CarouselSlide = {
  heading: string;
  body: string;
  design: string;
};

export type VideoScene = {
  label: string;
  durationSec: number;
  visual: string;
  onScreenText: string;
  voiceOver: string;
};

export type VideoPlan = {
  idea: string;
  style: string;
  script: string;
  scenes: VideoScene[];
  subtitles: string;
  thumbnailConcept: string;
  thumbnailMediaId?: string;
};

export type QualityIssue = {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
};

export type Destination = {
  id: string; // platform-native id / URN
  name: string;
  type: string; // person | organization | page | ig_account | board | channel | account
};

export type ContentItem = {
  id: string;
  groupId: string | null;
  platform: Platform;
  contentType: ContentType;
  category: string;
  topic: string;
  language: string;
  status: ContentStatus;
  title: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  keywords: string[];
  link: string;
  imagePrompt: string;
  imageConcept: string;
  mediaIds: string[];
  carousel: CarouselSlide[];
  video: VideoPlan | null;
  quality: QualityIssue[];
  accountId: string | null;
  destinationId: string | null;
  scheduledAt: string | null;
  timezone: string | null;
  approvedAt: string | null;
  approvedHash: string | null;
  duplicateOverride: boolean;
  publishedAt: string | null;
  platformPostId: string | null;
  publishedUrl: string | null;
  lastError: string | null;
  attempts: number;
  generator: "ai" | "template";
  createdAt: string;
  updatedAt: string;
};

export type SocialAccountPublic = {
  id: string;
  platform: Platform;
  accountName: string;
  externalId: string;
  destinations: Destination[];
  scopes: string[];
  status: "connected" | "expired" | "disconnected" | "error";
  expiresAt: string | null;
  connectedAt: string;
  lastTestedAt: string | null;
  lastError: string | null;
};

export type MediaAsset = {
  id: string;
  name: string;
  category: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  source: "upload" | "generated";
  createdAt: string;
};

export type BusinessProfile = {
  businessName: string;
  description: string;
  industry: string;
  products: string;
  services: string;
  targetAudience: string;
  location: string;
  website: string;
  contact: string;
  whatsapp: string;
  logoMediaId: string;
  brandColors: string[];
  brandFonts: string;
  brandStyle: string;
  preferredLanguage: string;
  preferredTone: string;
  brandVoice: string;
  customRules: string;
  preferredPlatforms: Platform[];
  postingFrequency: string;
};

export type PublishingMode = "manual" | "approve_schedule" | "queue";

export type AppSettings = {
  publishingMode: PublishingMode;
  timezone: string;
  postingTimes: string[]; // "HH:MM" local slots used by the approved-content queue
  maxPostsPerDayPerPlatform: number;
  duplicateWindowDays: number;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

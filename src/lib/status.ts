// Content lifecycle rules. This module is the single source of truth for the
// approval gate and is enforced by the backend (publisher, scheduler, server
// actions) — the UI only mirrors it.

import type { ContentStatus } from "./types.ts";

const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  IDEA: ["GENERATING", "DRAFT", "WAITING_FOR_APPROVAL", "CANCELLED"],
  GENERATING: ["DRAFT", "WAITING_FOR_APPROVAL", "IDEA", "CANCELLED"],
  DRAFT: ["WAITING_FOR_APPROVAL", "APPROVED", "GENERATING", "CANCELLED"],
  WAITING_FOR_APPROVAL: ["APPROVED", "DRAFT", "GENERATING", "CANCELLED"],
  APPROVED: ["SCHEDULED", "PUBLISHING", "WAITING_FOR_APPROVAL", "DRAFT", "CANCELLED"],
  SCHEDULED: ["APPROVED", "PUBLISHING", "WAITING_FOR_APPROVAL", "DRAFT", "CANCELLED"],
  PUBLISHING: ["PUBLISHED", "PUBLISH_FAILED"],
  PUBLISHED: [],
  PUBLISH_FAILED: ["PUBLISHING", "APPROVED", "SCHEDULED", "WAITING_FOR_APPROVAL", "DRAFT", "CANCELLED"],
  CANCELLED: ["DRAFT"],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/** Statuses whose content may still be edited. Editing resets approval. */
export const EDITABLE: ContentStatus[] = [
  "IDEA",
  "DRAFT",
  "WAITING_FOR_APPROVAL",
  "APPROVED",
  "SCHEDULED",
  "PUBLISH_FAILED",
];

export type GateInput = {
  status: ContentStatus;
  approvedAt: string | null;
  approvedHash: string | null;
  currentHash: string;
};

export type GateResult = { ok: true } | { ok: false; reason: string };

/**
 * Core rule:  IF content.status != APPROVED  → DO NOT PUBLISH.
 * SCHEDULED is "APPROVED + SCHEDULED"; PUBLISH_FAILED may be retried only if it
 * was approved and has not been edited since. The approval is bound to a hash of
 * the approved content, so any change after approval invalidates it.
 */
export function publishGate(c: GateInput): GateResult {
  if (!["APPROVED", "SCHEDULED", "PUBLISH_FAILED"].includes(c.status)) {
    return { ok: false, reason: `Content is ${c.status}; only approved content can be published.` };
  }
  if (!c.approvedAt || !c.approvedHash) {
    return { ok: false, reason: "Content has no recorded user approval." };
  }
  if (c.approvedHash !== c.currentHash) {
    return { ok: false, reason: "Content changed after approval. Please review and approve again." };
  }
  return { ok: true };
}

/**
 * Scheduler rule:
 *   status == APPROVED(+SCHEDULED) AND scheduled_time <= now AND account connected → PUBLISH
 */
export function isDueForScheduledPublish(
  c: GateInput & { scheduledAt: string | null },
  accountConnected: boolean,
  now: Date,
): boolean {
  if (c.status !== "SCHEDULED") return false;
  if (!c.scheduledAt || new Date(c.scheduledAt).getTime() > now.getTime()) return false;
  if (!accountConnected) return false;
  return publishGate(c).ok;
}

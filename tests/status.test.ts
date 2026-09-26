import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, isDueForScheduledPublish, publishGate } from "../src/lib/status.ts";

const approved = { status: "APPROVED" as const, approvedAt: "2026-09-26T10:00:00Z", approvedHash: "h1", currentHash: "h1" };

test("only approved content passes the publish gate", () => {
  assert.equal(publishGate(approved).ok, true);
  for (const status of ["IDEA", "GENERATING", "DRAFT", "WAITING_FOR_APPROVAL", "PUBLISHING", "PUBLISHED", "CANCELLED"] as const) {
    assert.equal(publishGate({ ...approved, status }).ok, false, status);
  }
});

test("approval without a recorded approval is rejected", () => {
  assert.equal(publishGate({ ...approved, approvedAt: null }).ok, false);
  assert.equal(publishGate({ ...approved, approvedHash: null }).ok, false);
});

test("content edited after approval is rejected", () => {
  const r = publishGate({ ...approved, currentHash: "h2" });
  assert.equal(r.ok, false);
});

test("scheduled + approved + due + connected → publish", () => {
  const now = new Date("2026-09-27T10:00:00Z");
  const c = { ...approved, status: "SCHEDULED" as const, scheduledAt: "2026-09-27T09:59:00Z" };
  assert.equal(isDueForScheduledPublish(c, true, now), true);
  assert.equal(isDueForScheduledPublish(c, false, now), false, "account disconnected");
  assert.equal(isDueForScheduledPublish({ ...c, scheduledAt: "2026-09-27T10:01:00Z" }, true, now), false, "not yet due");
  assert.equal(isDueForScheduledPublish({ ...c, status: "APPROVED" }, true, now), false, "not scheduled");
  assert.equal(isDueForScheduledPublish({ ...c, status: "WAITING_FOR_APPROVAL" }, true, now), false, "not approved");
  assert.equal(isDueForScheduledPublish({ ...c, currentHash: "changed" }, true, now), false, "edited after approval");
});

test("state machine forbids skipping approval", () => {
  assert.equal(canTransition("WAITING_FOR_APPROVAL", "PUBLISHING"), false);
  assert.equal(canTransition("DRAFT", "PUBLISHED"), false);
  assert.equal(canTransition("DRAFT", "SCHEDULED"), false);
  assert.equal(canTransition("APPROVED", "PUBLISHING"), true);
  assert.equal(canTransition("PUBLISHING", "PUBLISHED"), true);
  assert.equal(canTransition("PUBLISHED", "DRAFT"), false);
});

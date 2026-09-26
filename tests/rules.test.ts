import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanHashtags, composeCaption, similarity } from "../src/lib/platform-rules.ts";
import { utcToZoned, zonedToUtc } from "../src/lib/time.ts";

test("hashtags are normalised, de-duplicated, spam-filtered and capped", () => {
  const out = cleanHashtags(["#Interiors", "interiors", "#f4f", "Modular Interiors", "#a", "#Design", "#Home", "#Kitchen", "#Extra"], "linkedin");
  assert.deepEqual(out, ["#Interiors", "#ModularInteriors", "#Design", "#Home", "#Kitchen"]);
  assert.equal(cleanHashtags(["a1", "b2", "c3"], "x").length, 2);
});

test("caption composition does not duplicate hook or CTA", () => {
  const c = composeCaption({ hook: "Hook line", body: "Hook line\n\nBody text", cta: "Contact us", hashtags: ["#One"] });
  assert.equal(c, "Hook line\n\nBody text\n\nContact us\n\n#One");
});

test("similarity detects near-duplicates", () => {
  const a = "Five modular kitchen ideas that save space and time for busy families";
  assert.ok(similarity(a, a + " #kitchen") > 0.9);
  assert.ok(similarity(a, "Our team visited a new site in Hyderabad today") < 0.2);
});

test("time zone conversion round-trips", () => {
  assert.equal(zonedToUtc("2026-09-27T10:00", "Asia/Kolkata"), "2026-09-27T04:30:00.000Z");
  assert.equal(utcToZoned("2026-09-27T04:30:00.000Z", "Asia/Kolkata"), "2026-09-27T10:00");
  assert.equal(zonedToUtc("2026-07-01T09:00", "America/New_York"), "2026-07-01T13:00:00.000Z");
  assert.equal(zonedToUtc("2026-12-01T09:00", "America/New_York"), "2026-12-01T14:00:00.000Z");
});

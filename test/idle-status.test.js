import { test } from "node:test";
import assert from "node:assert/strict";
import { translate, formatStartCountdown } from "../src/localization.js";
import { normalizeConfig, nextScheduledStart } from "../src/timing.js";
const manual = {
  mode: "manual",
  phases: [{ label: "Prepare", duration: "00:10:00" }],
};
test("idle translations follow HA language, regional tags and explicit language overrides", () => {
  for (const [language, ready] of [
    ["en", "Ready to start"],
    ["de-DE", "Bereit zum Start"],
    ["uk-UA", "Готово до початку"],
    ["fr", "Prêt à démarrer"],
    ["es", "Listo para empezar"],
    ["pl", "Gotowe do rozpoczęcia"],
    ["zz", "Ready to start"],
  ])
    assert.equal(translate({}, "ready_to_start", language), ready);
  assert.equal(
    translate({ translations: { language: "uk" } }, "ready_to_start", "en"),
    "Готово до початку",
  );
  assert.equal(
    translate(
      { translations: { starts_in: "Go in {duration}" } },
      "starts_in",
      "en",
      "18h",
    ),
    "Go in 18h",
  );
  assert.equal(
    translate(
      { now_label: "Legacy", translations: { now: "New" } },
      "now",
      "en",
    ),
    "New",
  );
  assert.equal(translate({ now_label: "Legacy" }, "now", "en"), "Legacy");
});
test("idle countdown uses rounded-up localized hours, minutes or seconds", () => {
  assert.equal(formatStartCountdown(64800000, "en"), "18h");
  assert.equal(formatStartCountdown(3900000, "en"), "2h");
  assert.equal(formatStartCountdown(3540000, "en"), "59m");
  assert.equal(formatStartCountdown(30000, "en"), "30s");
  assert.match(formatStartCountdown(64800000, "uk"), /^18\s?г/);
});
test("next scheduled start respects finish anchors, overnight windows and DST", () => {
  for (const [anchor, duration, now, zone, expected] of [
    [
      { at: "09:00", edge: "start" },
      "00:10:00",
      "2026-01-01T15:00:00Z",
      "UTC",
      "2026-01-02T09:00:00Z",
    ],
    [
      { at: "09:00", edge: "end" },
      "01:00:00",
      "2026-01-01T14:00:00Z",
      "UTC",
      "2026-01-02T08:00:00Z",
    ],
    [
      { at: "23:50", edge: "start" },
      "00:20:00",
      "2026-01-02T00:11:00Z",
      "UTC",
      "2026-01-02T23:50:00Z",
    ],
    [
      { at: "09:00", edge: "start" },
      "00:10:00",
      "2026-03-28T09:10:00Z",
      "Europe/Berlin",
      "2026-03-29T07:00:00Z",
    ],
    [
      { at: "09:00", edge: "start" },
      "00:10:00",
      "2026-10-24T09:10:00Z",
      "Europe/Berlin",
      "2026-10-25T08:00:00Z",
    ],
    [
      { at: "00:01", edge: "end" },
      "23:00:00",
      "2026-01-01T00:02:00Z",
      "UTC",
      "2026-01-01T01:01:00Z",
    ],
  ]) {
    const c = normalizeConfig({
      mode: "scheduled",
      anchor,
      phases: [{ label: "Phase", duration }],
    });
    assert.equal(
      nextScheduledStart(c, Date.parse(now), zone),
      Date.parse(expected),
    );
  }
});
test("translation blocks reject malformed input and countdowns without the duration placeholder", () => {
  for (const translations of [
    null,
    [],
    true,
    { now: 2 },
    { language: "bad locale!" },
    { ready_to_start: false },
    { starts_in: "Soon" },
    { typo: "value" },
  ])
    assert.throws(() => normalizeConfig({ ...manual, translations }));
  assert.equal(
    normalizeConfig({
      ...manual,
      translations: { now: "", starts_in: "In {duration}" },
    }).translations.now,
    "",
  );
});

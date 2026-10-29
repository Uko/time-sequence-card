import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeConfig,
  resolveSequence,
  timedPhases,
  sequenceWarnings,
} from "../src/timing.js";
const phase = { label: "Setup", duration: "00:01:00" };
test("mixed sound rows consume no time or phase colours and keep default timed IDs stable", () => {
  const plain = normalizeConfig({ mode: "manual", phases: [phase, phase] });
  const mixed = normalizeConfig({
    mode: "manual",
    phases: [
      { sound: "/start.wav" },
      phase,
      { sound: "/middle.wav" },
      phase,
      { sound: "/end.wav" },
    ],
  });
  assert.deepEqual(timedPhases(mixed), plain.phases);
  const s = resolveSequence(mixed, 1000, "UTC", 1000);
  assert.equal(s.end, 121000);
  assert.equal(s.phases.length, 2);
  assert.deepEqual(
    s.cues.map((c) => [c.sound, c.end]),
    [
      ["/start.wav", 1000],
      ["/middle.wav", 61000],
      ["/end.wav", 121000],
    ],
  );
});
test("adjacent sounds produce advisory warnings without rejecting the configuration", () => {
  const c = normalizeConfig({
    mode: "manual",
    phases: [{ sound: "/one.wav" }, { sound: "/two.wav" }, phase],
  });
  assert.equal(sequenceWarnings(c.phases).length, 1);
  assert.match(sequenceWarnings(c.phases)[0], /Adjacent sounds/);
  assert.equal(
    sequenceWarnings([phase, { sound: "/one.wav" }, phase]).length,
    0,
  );
  assert.throws(() =>
    normalizeConfig({ mode: "manual", phases: [{ sound: "/one.wav" }] }),
  );
  assert.throws(() =>
    normalizeConfig({
      mode: "manual",
      phases: [phase, { sound: "//example.org/one.wav" }],
    }),
  );
});
test("legacy end sounds coexist with ordered cue rows and finish anchors ignore cue rows", () => {
  const c = normalizeConfig({
    mode: "scheduled",
    anchor: { at: "12:00", edge: "end" },
    phases: [
      { sound: "/start.wav" },
      { ...phase, sound: "/legacy.wav" },
      { sound: "/end.wav" },
    ],
  });
  const s = resolveSequence(c, Date.parse("2026-01-01T11:59:30Z"), "UTC", null);
  assert.equal(s.start, Date.parse("2026-01-01T11:59:00Z"));
  assert.deepEqual(
    s.cues.map((c) => c.sound),
    ["/start.wav", "/legacy.wav", "/end.wav"],
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../src/timing.js";
import { endedSound } from "../src/sound.js";
const phase = {
  id: "a",
  label: "Prepare",
  duration: "00:00:01",
  sound: "/local/sounds/example.mp3",
};
test("phase sounds are optional and restricted to same-origin root-relative media paths", () => {
  assert.equal(
    normalizeConfig({ mode: "manual", phases: [phase] }).phases[0].sound,
    phase.sound,
  );
  for (const sound of [
    "",
    null,
    1,
    true,
    "https://example.org/tone.mp3",
    "//example.org/tone.mp3",
    "/\\evil/tone.mp3",
    "javascript:alert(1)",
    " /tone.mp3",
    "/tone\n.mp3",
  ])
    assert.throws(
      () => normalizeConfig({ mode: "manual", phases: [{ ...phase, sound }] }),
      /sound/,
    );
  assert.equal(
    normalizeConfig({
      mode: "manual",
      phases: [{ label: "Silent", duration: "00:00:01" }],
    }).phases[0].sound,
    undefined,
  );
});
test("sounds trigger only on crossed ends, never mount, clock rollback or stale catch-up", () => {
  const s = {
    start: 0,
    end: 10000,
    phases: [
      { ...phase, end: 5000 },
      { ...phase, id: "b", end: 10000 },
    ],
  };
  assert.equal(endedSound(s, null, null, 5000), null);
  assert.equal(endedSound(s, null, 4000, 4999), null);
  assert.equal(endedSound(s, null, 4999, 5000).id, "a");
  assert.equal(endedSound(s, null, 5000, 5000), null);
  assert.equal(endedSound(s, null, 6000, 5000), null);
  assert.equal(endedSound(s, null, 0, 90000), null);
  assert.equal(endedSound(s, null, 0, 10000).id, "b");
});
test("previous sequence final sound survives midnight occurrence rollover without ringing superseded overlapping sequences", () => {
  const previous = {
    start: 1000,
    end: 5000,
    phases: [{ ...phase, end: 5000 }],
  };
  const future = {
    start: 10000,
    end: 11000,
    phases: [{ ...phase, end: 11000 }],
  };
  assert.equal(endedSound(future, previous, 4999, 5000).id, "a");
  assert.equal(
    endedSound({ ...future, start: 4000 }, previous, 4999, 5000),
    null,
  );
  assert.equal(endedSound(null, previous, 4999, 5000), null);
});

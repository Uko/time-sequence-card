import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeConfig,
  resolveSequence,
  sequenceState,
} from "../src/timing.js";
test("scheduled finish works backwards in the HA timezone and keeps the deadline when durations change", () => {
  const now = Date.parse("2026-01-15T07:00:00Z");
  const config = normalizeConfig({
    mode: "scheduled",
    anchor: { at: "08:25", edge: "end" },
    phases: [
      { label: "Prepare", duration: "00:10:00" },
      { label: "Travel", duration: "00:15:00" },
    ],
  });
  const result = resolveSequence(config, now, "Europe/Berlin", null);
  assert.equal(new Date(result.end).toISOString(), "2026-01-15T07:25:00.000Z");
  assert.equal(
    new Date(result.start).toISOString(),
    "2026-01-15T07:00:00.000Z",
  );
  const longer = normalizeConfig({
    ...config,
    phases: [
      { label: "Prepare", duration: "00:20:00" },
      { label: "Travel", duration: "00:15:00" },
    ],
  });
  assert.equal(
    resolveSequence(longer, now, "Europe/Berlin", null).end,
    result.end,
  );
  assert.equal(
    resolveSequence(longer, now, "Europe/Berlin", null).start,
    result.start - 600000,
  );
});
test("rejects malformed or unsafe configuration before rendering", () => {
  const base = {
    mode: "manual",
    phases: [{ label: "Phase", duration: "00:01:00" }],
  };
  const invalid = [
    {},
    { ...base, mode: "other" },
    { ...base, phases: [] },
    { ...base, phases: [{ label: "Bad", duration: "00:60:00" }] },
    { ...base, phases: [{ label: "Bad", duration: "00:00:00" }] },
    { ...base, phases: [{ label: "Bad", duration: "01:00" }] },
    { ...base, phases: [{ label: "Bad", duration: 10 }] },
    {
      ...base,
      phases: [
        {
          label: "Bad",
          duration: "00:01:00",
          color: "url(https://example.org/x)",
        },
      ],
    },
    { ...base, mode: "scheduled", anchor: { at: "25:00", edge: "end" } },
    { ...base, mode: "scheduled", anchor: { at: "08:00", edge: "middle" } },
    { ...base, timezone: "No/Such_Zone" },
    { ...base, height: NaN },
    { ...base, show_remaining: "yes" },
    {
      ...base,
      phases: [
        { id: "x", label: "One", duration: "00:01:00" },
        { id: "x", label: "Two", duration: "00:01:00" },
      ],
    },
  ];
  for (const value of invalid)
    assert.throws(
      () => normalizeConfig(value),
      undefined,
      JSON.stringify(value),
    );
  assert.equal(normalizeConfig(base).mode, "manual");
  assert.equal(normalizeConfig(base).phases[0].milliseconds, 60000);
});
test("scheduled windows spanning midnight remain on the active occurrence", () => {
  const end = normalizeConfig({
    mode: "scheduled",
    anchor: { at: "00:10", edge: "end" },
    phases: [{ label: "Night", duration: "00:30:00" }],
  });
  const before = resolveSequence(
    end,
    Date.parse("2026-01-01T23:50:00Z"),
    "UTC",
    null,
  );
  assert.equal(new Date(before.end).toISOString(), "2026-01-02T00:10:00.000Z");
  const start = normalizeConfig({
    ...end,
    anchor: { at: "23:50", edge: "start" },
  });
  const after = resolveSequence(
    start,
    Date.parse("2026-01-02T00:05:00Z"),
    "UTC",
    null,
  );
  assert.equal(new Date(after.start).toISOString(), "2026-01-01T23:50:00.000Z");
});
test("DST uses compatible wall-clock resolution and real elapsed phase durations", () => {
  const config = normalizeConfig({
    mode: "scheduled",
    anchor: { at: "02:30", edge: "start" },
    phases: [{ label: "Phase", duration: "00:10:00" }],
  });
  const spring = resolveSequence(
    config,
    Date.parse("2026-03-29T00:00:00Z"),
    "Europe/Berlin",
    null,
  );
  assert.equal(
    new Date(spring.start).toISOString(),
    "2026-03-29T01:30:00.000Z",
  );
  const autumn = resolveSequence(
    config,
    Date.parse("2026-10-25T00:00:00Z"),
    "Europe/Berlin",
    null,
  );
  assert.equal(
    new Date(autumn.start).toISOString(),
    "2026-10-25T00:30:00.000Z",
  );
  assert.equal(spring.end - spring.start, 600000);
});
const phases = [
  { label: "Setup", duration: "00:01:00" },
  { label: "Talk", duration: "00:10:00" },
  { label: "Questions", duration: "00:03:00" },
];
test("manual sequence keeps every boundary fixed to Start", () => {
  const config = normalizeConfig({ mode: "manual", phases });
  const start = Date.parse("2026-01-01T12:00:00Z");
  const sequence = resolveSequence(config, start + 120000, "UTC", start);
  assert.deepEqual(
    sequence.phases.map((p) => [p.start - start, p.end - start]),
    [
      [0, 60000],
      [60000, 660000],
      [660000, 840000],
    ],
  );
  assert.equal(sequenceState(sequence, start + 120000).index, 1);
  assert.equal(sequenceState(sequence, start + 660000).index, 2);
  assert.equal(sequenceState(sequence, start + 840000).status, "finished");
  assert.equal(resolveSequence(config, start, "UTC", null), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeConfig,
  timelineWindow,
  resolveSequence,
  sequenceState,
} from "../src/timing.js";
const base = {
  mode: "manual",
  phases: [{ label: "Phase", duration: "00:10:00" }],
};
test("padding is independently validated in minutes and defaults to zero", () => {
  const c = normalizeConfig(base);
  assert.equal(c.padding_before, 0);
  assert.equal(c.padding_after, 0);
  for (const key of ["padding_before", "padding_after"])
    for (const value of [-1, Infinity, NaN, "5", null, true, 1441])
      assert.throws(() => normalizeConfig({ ...base, [key]: value }));
  assert.equal(
    normalizeConfig({ ...base, padding_before: 0.5 }).padding_before,
    0.5,
  );
});
test("padding extends only the viewport, never phase timings or session duration", () => {
  const c = normalizeConfig({ ...base, padding_before: 5, padding_after: 10 });
  const sequence = resolveSequence(c, 600000, "UTC", 600000);
  assert.deepEqual(timelineWindow(c, sequence), {
    start: 300000,
    end: 1800000,
    duration: 1500000,
  });
  assert.equal(sequence.start, 600000);
  assert.equal(sequence.end, 1200000);
  assert.equal(sequenceState(sequence, 450000).status, "upcoming");
  assert.equal(sequenceState(sequence, 1300000).status, "finished");
});
test("scheduled padding selects the relevant adjacent-day occurrence without displacing an active one", () => {
  const c = normalizeConfig({
    mode: "scheduled",
    anchor: { at: "00:02", edge: "start" },
    padding_before: 5,
    padding_after: 5,
    phases: [{ label: "Phase", duration: "00:10:00" }],
  });
  assert.equal(
    resolveSequence(c, Date.parse("2026-01-01T23:59:00Z"), "UTC", null).start,
    Date.parse("2026-01-02T00:02:00Z"),
  );
  const late = normalizeConfig({
    ...c,
    anchor: { at: "23:50", edge: "start" },
  });
  assert.equal(
    resolveSequence(late, Date.parse("2026-01-02T00:03:00Z"), "UTC", null)
      .start,
    Date.parse("2026-01-01T23:50:00Z"),
  );
  const wide = normalizeConfig({
    ...late,
    padding_before: 1440,
    padding_after: 1440,
  });
  assert.equal(
    sequenceState(
      resolveSequence(wide, Date.parse("2026-01-02T23:55:00Z"), "UTC", null),
      Date.parse("2026-01-02T23:55:00Z"),
    ).status,
    "active",
  );
});

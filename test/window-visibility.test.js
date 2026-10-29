import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeConfig,
  resolveSequence,
  isSequenceVisible,
} from "../src/timing.js";
const base = {
  mode: "scheduled",
  anchor: { at: "12:00", edge: "start" },
  phases: [{ label: "Event", duration: "00:10:00" }],
};
function visible(input, at, zone = "UTC") {
  const c = normalizeConfig(input),
    now = Date.parse(at);
  return isSequenceVisible(c, resolveSequence(c, now, zone, null), now);
}
test("window visibility is strictly opt-in and manual mode always stays visible", () => {
  assert.equal(normalizeConfig(base).hide_outside_window, false);
  for (const value of ["true", 1, null, {}])
    assert.throws(
      () => normalizeConfig({ ...base, hide_outside_window: value }),
      /hide_outside_window/,
    );
  assert.equal(visible(base, "2026-01-01T01:00:00Z"), true);
  assert.equal(
    visible(
      { ...base, mode: "manual", hide_outside_window: true },
      "2026-01-01T01:00:00Z",
    ),
    true,
  );
});
test("visibility includes padding and handles exact edges, midnight and finish anchors", () => {
  const c = {
    ...base,
    hide_outside_window: true,
    padding_before: 5,
    padding_after: 5,
  };
  for (const [at, expected] of [
    ["11:54:59", false],
    ["11:55:00", true],
    ["12:00:00", true],
    ["12:10:00", true],
    ["12:14:59", true],
    ["12:15:00", false],
  ])
    assert.equal(visible(c, "2026-01-01T" + at + "Z"), expected, at);
  const midnight = { ...c, anchor: { at: "00:02", edge: "start" } };
  assert.equal(visible(midnight, "2026-01-01T23:57:00Z"), true);
  assert.equal(visible(midnight, "2026-01-02T00:16:59Z"), true);
  assert.equal(visible(midnight, "2026-01-02T00:17:00Z"), false);
  const finish = { ...c, anchor: { at: "00:05", edge: "end" } };
  assert.equal(visible(finish, "2026-01-01T23:50:00Z"), true);
  assert.equal(visible(finish, "2026-01-02T00:10:00Z"), false);
});
test("visibility uses HA timezone and handles both DST transition days", () => {
  const c = {
    ...base,
    hide_outside_window: true,
    anchor: { at: "07:00", edge: "start" },
    padding_before: 5,
    padding_after: 5,
  };
  for (const [day, offset] of [
    ["2026-03-29", "+02:00"],
    ["2026-10-25", "+01:00"],
  ]) {
    assert.equal(visible(c, day + "T06:56:00" + offset, "Europe/Berlin"), true);
    assert.equal(
      visible(c, day + "T07:15:00" + offset, "Europe/Berlin"),
      false,
    );
  }
  assert.equal(
    visible(
      { ...c, timezone: "Europe/Berlin" },
      "2026-03-29T06:56:00+02:00",
      "UTC",
    ),
    true,
  );
});

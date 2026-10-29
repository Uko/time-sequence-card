import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../src/timing.js";
const base = {
  mode: "manual",
  phases: [{ label: "Prepare", duration: "00:05:00" }],
};
test("event text scale defaults to one and accepts only finite factors from 0.5 to 3", () => {
  assert.equal(normalizeConfig(base).event_text_scale, 1);
  for (const value of [0.5, 0.8, 1, 1.2, 3])
    assert.equal(
      normalizeConfig({ ...base, event_text_scale: value }).event_text_scale,
      value,
    );
  for (const value of [
    0,
    -1,
    0.49,
    3.01,
    NaN,
    Infinity,
    null,
    true,
    "1.2",
    "12px",
  ])
    assert.throws(
      () => normalizeConfig({ ...base, event_text_scale: value }),
      /event_text_scale/,
    );
});

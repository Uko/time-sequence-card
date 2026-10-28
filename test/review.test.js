import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig, resolveSequence } from "../src/timing.js";
test("generated IDs never collide with explicit phase IDs", () => {
  const config = normalizeConfig({
    mode: "manual",
    phases: [
      { id: "phase-1", label: "One", duration: "00:01:00" },
      { label: "Two", duration: "00:01:00" },
    ],
  });
  assert.equal(new Set(config.phases.map((p) => p.id)).size, 2);
});
test("latest started occurrence wins on an overlapping short DST day", () => {
  const config = normalizeConfig({
    mode: "scheduled",
    anchor: { at: "09:00", edge: "start" },
    phases: [{ label: "Long", duration: "23:30:00" }],
  });
  const sequence = resolveSequence(
    config,
    Date.parse("2026-03-29T07:10:00Z"),
    "Europe/Berlin",
    null,
  );
  assert.equal(
    new Date(sequence.start).toISOString(),
    "2026-03-29T07:00:00.000Z",
  );
});

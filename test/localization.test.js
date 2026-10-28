import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveNowLabel } from "../src/localization.js";
import { normalizeConfig } from "../src/timing.js";
test("Now defaults follow supported HA languages, regional variants and a safe fallback", () => {
  for (const [language, word] of [
    ["en", "Now"],
    ["de-DE", "Jetzt"],
    ["uk-UA", "Зараз"],
    ["fr", "Maintenant"],
    ["es", "Ahora"],
    ["pl", "Teraz"],
    ["zz", "Now"],
    [undefined, "Now"],
  ])
    assert.equal(resolveNowLabel(undefined, language), word);
});
test("explicit marker wording preserves custom text, case and time-only choice", () => {
  assert.equal(resolveNowLabel("Right HERE", "de"), "Right HERE");
  assert.equal(resolveNowLabel("", "uk"), "");
});
test("marker wording is text-only configuration, not a truthy coercion", () => {
  const config = {
    mode: "manual",
    phases: [{ label: "Phase", duration: "00:01:00" }],
  };
  for (const now_label of [false, 2, {}, null])
    assert.throws(() => normalizeConfig({ ...config, now_label }));
  assert.equal(normalizeConfig({ ...config, now_label: "" }).now_label, "");
});

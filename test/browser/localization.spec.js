import { test, expect } from "@playwright/test";
async function mount(page, extra = {}) {
  await page.clock.setFixedTime(new Date("2026-01-01T12:05:00Z"));
  await page.goto("/test/fixture.html");
  await page.evaluate(async (extra) => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig({
      mode: "scheduled",
      minimalist: true,
      anchor: { at: "12:00", edge: "start" },
      phases: [{ label: "Phase", duration: "00:10:00" }],
      ...extra,
    });
    window.card.hass = {
      config: { time_zone: "UTC" },
      locale: { language: "en" },
    };
    document.querySelector("main").append(window.card);
  }, extra);
}
test("marker follows HA language changes unless exact custom text is supplied", async ({
  page,
}) => {
  await mount(page);
  await expect(page.locator(".now-word")).toHaveText("Now");
  await page.evaluate(
    () =>
      (window.card.hass = {
        ...window.card.hass,
        locale: { language: "uk-UA" },
      }),
  );
  await expect(page.locator(".now-word")).toHaveText("Зараз");
  await page.screenshot({ path: "test-results/localized-marker.png" });
  await page.evaluate(
    () =>
      (window.card.hass = {
        ...window.card.hass,
        locale: { language: "de-DE" },
      }),
  );
  await expect(page.locator(".now-word")).toHaveText("Jetzt");
  await page.evaluate(() =>
    window.card.setConfig({
      ...window.card.config,
      now_label: "<b>Right HERE</b>",
    }),
  );
  await expect(page.locator(".now-word")).toHaveText("<b>Right HERE</b>");
  await expect(page.locator(".now-word b")).toHaveCount(0);
  await page.evaluate(() =>
    window.card.setConfig({ ...window.card.config, now_label: "" }),
  );
  await expect(page.locator(".now-word")).toBeHidden();
  await expect(page.locator(".now-time")).toHaveText("12:05");
});
test("wording and language changes preserve a running manual session", async ({
  page,
}) => {
  await mount(page, { mode: "manual" });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const startedAt = await page.evaluate(() => window.card.startedAt);
  await page.evaluate(() => {
    window.card.setConfig({ ...window.card.config, now_label: "Right HERE" });
    window.card.hass = { ...window.card.hass, locale: { language: "de" } };
  });
  expect(await page.evaluate(() => window.card.startedAt)).toBe(startedAt);
  await expect(page.locator(".now-word")).toHaveText("Right HERE");
});

test("editor can set and clear the marker wording override", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(async () => {
    const editor = await customElements
      .get("time-sequence-card")
      .getConfigElement();
    editor.setConfig({
      mode: "manual",
      phases: [{ label: "Phase", duration: "00:01:00" }],
    });
    editor.addEventListener(
      "config-changed",
      (e) => (window.changed = e.detail.config),
    );
    document.querySelector("main").replaceChildren(editor);
  });
  const field = page.getByLabel(
    "Now label (blank uses selected language)",
  );
  await field.fill("Зараз");
  await field.dispatchEvent("change");
  expect(await page.evaluate(() => window.changed.translations.now)).toBe(
    "Зараз",
  );
  await field.fill("");
  await field.dispatchEvent("change");
  expect(
    await page.evaluate(() => Object.hasOwn(window.changed, "now_label")),
  ).toBe(false);
});
test("long marker wording yields space to the clock without overflowing a narrow card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await mount(page, {
    now_label:
      "This is a deliberately very long custom marker label that must not hide the clock",
  });
  await page.evaluate(() => window.card.layoutAxis());
  const geometry = await page.evaluate(() => {
    const r = window.card.shadowRoot;
    const label = r.querySelector(".now-label").getBoundingClientRect(),
      axis = r.querySelector(".axis").getBoundingClientRect();
    return {
      left: label.left,
      right: label.right,
      axisLeft: axis.left,
      axisRight: axis.right,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(geometry.axisLeft - 1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.axisRight + 1);
  await expect(page.locator(".now-time")).toHaveText("12:05");
});

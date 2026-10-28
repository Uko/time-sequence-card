import { test, expect } from "@playwright/test";
async function mount(page, extra = {}) {
  await page.clock.setFixedTime(new Date("2026-01-01T15:00:00Z"));
  await page.goto("/test/fixture.html");
  await page.evaluate(async (extra) => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig({
      mode: "scheduled",
      anchor: { at: "09:00", edge: "start" },
      minimalist: true,
      show_remaining: false,
      phases: [{ label: "Prepare", duration: "00:10:00" }],
      ...extra,
    });
    window.card.hass = {
      config: { time_zone: "UTC" },
      locale: { language: "en" },
    };
    document.querySelector("main").append(window.card);
  }, extra);
}
test("scheduled idle status includes next-start countdown even in minimalist mode with countdowns hidden", async ({
  page,
}) => {
  await mount(page);
  await expect(page.locator(".status-label")).toHaveText("Start in 18h");
  await expect(page.locator(".remaining")).toHaveText("");
  await page.screenshot({ path: "test-results/next-start-status.png" });
  await page.clock.setFixedTime(new Date("2026-01-02T08:59:30Z"));
  await page.evaluate(() => window.card.tick());
  await expect(page.locator(".status-label")).toHaveText("Start in 30s");
  await page.clock.setFixedTime(new Date("2026-01-02T09:00:00Z"));
  await page.evaluate(() => window.card.tick());
  await expect(page.locator(".status-label")).toHaveText("Prepare");
});
test("finished manual runs are ready to start again without Reset or an automatic restart", async ({
  page,
}) => {
  await mount(page, { mode: "manual" });
  await expect(page.locator(".status-label")).toHaveText("Ready to start");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const original = await page.evaluate(() => window.card.startedAt);
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeDisabled();
  await page.clock.setFixedTime(new Date("2026-01-01T15:10:00Z"));
  await page.evaluate(() => window.card.tick());
  await expect(page.locator(".status-label")).toHaveText("Ready to start");
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => window.card.startedAt)).toBe(original);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  expect(await page.evaluate(() => window.card.startedAt)).not.toBe(original);
  await expect(page.locator(".status-label")).toHaveText("Prepare");
});
test("translation block overrides language and safely formats custom idle wording", async ({
  page,
}) => {
  await mount(page, { translations: { language: "uk" } });
  await expect(page.locator(".status-label")).toContainText("Початок через 18");
  await page.evaluate(() =>
    window.card.setConfig({
      ...window.card.config,
      translations: { language: "en", starts_in: "<b>Go in {duration}</b>" },
    }),
  );
  await expect(page.locator(".status-label")).toHaveText("<b>Go in 18h</b>");
  await expect(page.locator(".status-label b")).toHaveCount(0);
  await page.evaluate(() =>
    window.card.setConfig({
      ...window.card.config,
      mode: "manual",
      translations: { language: "de" },
    }),
  );
  await expect(page.locator(".status-label")).toHaveText("Bereit zum Start");
});
test("editor groups translations and migrates a legacy Now override only when that field is edited", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(async () => {
    window.editor = await customElements
      .get("time-sequence-card")
      .getConfigElement();
    window.editor.setConfig({
      mode: "manual",
      now_label: "Legacy",
      phases: [{ label: "Phase", duration: "00:01:00" }],
    });
    window.editor.addEventListener(
      "config-changed",
      (e) => (window.changed = e.detail.config),
    );
    document.querySelector("main").replaceChildren(window.editor);
  });
  const group = page.getByRole("group", { name: "Translations", exact: true });
  await expect(group).toBeVisible();
  const now = group.getByLabel(
    "Now label (blank uses selected language)",
  );
  await expect(now).toHaveValue("Legacy");
  await now.fill("Here");
  await now.dispatchEvent("change");
  expect(await page.evaluate(() => window.changed.translations.now)).toBe(
    "Here",
  );
  expect(
    await page.evaluate(() => Object.hasOwn(window.changed, "now_label")),
  ).toBe(false);
  const template = group.getByLabel("Start countdown (use {duration})");
  await template.fill("Begins in {duration}");
  await template.dispatchEvent("change");
  expect(await page.evaluate(() => window.changed.translations.starts_in)).toBe(
    "Begins in {duration}",
  );
});

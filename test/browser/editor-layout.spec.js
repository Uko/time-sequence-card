import { test, expect } from "@playwright/test";
async function mount(page, extra = {}) {
  await page.goto("/test/fixture.html");
  await page.evaluate(async (extra) => {
    await customElements.whenDefined("time-sequence-card");
    window.editor = await customElements
      .get("time-sequence-card")
      .getConfigElement();
    window.editor.setConfig({
      mode: "scheduled",
      title: "Morning routine",
      anchor: { at: "09:00", edge: "end" },
      phases: [
        { label: "Prepare", duration: "00:05:00" },
        { sound: "/local/sounds/ready.mp3" },
        { label: "Travel", duration: "00:10:00" },
      ],
      ...extra,
    });
    window.editor.addEventListener(
      "config-changed",
      (e) => (window.changed = e.detail.config),
    );
    document.querySelector("main").append(window.editor);
  }, extra);
}
test("boolean options are labelled keyboard-accessible switches, grouped by purpose", async ({
  page,
}) => {
  await mount(page);
  await expect(page.getByRole("switch")).toHaveCount(4);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  const display = page.getByRole("group", { name: "Display", exact: true }),
    timing = page.getByRole("group", { name: "Card & timing", exact: true });
  await expect(display.getByRole("switch")).toHaveCount(3);
  await expect(timing.getByRole("switch")).toHaveCount(1);
  for (const [label, key] of [
    ["Minimalist mode", "minimalist"],
    ["Show now marker", "show_now"],
    ["Show remaining time", "show_remaining"],
    ["Hide outside scheduled window", "hide_outside_window"],
  ]) {
    const input = page.getByRole("switch", { name: label, exact: true });
    const before = await input.isChecked();
    await input.focus();
    await page.keyboard.press("Space");
    await expect(input).toBeChecked({ checked: !before });
    expect(await page.evaluate((key) => window.changed[key], key)).toBe(
      !before,
    );
  }
  await page.getByLabel("Timing mode").selectOption("manual");
  await expect(page.getByRole("switch")).toHaveCount(3);
  await expect(
    page.getByLabel("Session ID (optional reload recovery)"),
  ).toBeVisible();
});
test("editor responds to its own narrow container, not the desktop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  await mount(page);
  await page.evaluate(() => (window.editor.style.width = "340px"));
  const layout = await page.evaluate(() => {
    const r = window.editor.shadowRoot;
    const a = r
        .querySelector('[aria-label="Timeline height"]')
        .getBoundingClientRect(),
      b = r
        .querySelector('[aria-label="Event text scale"]')
        .getBoundingClientRect();
    return {
      a: a.top,
      b: b.top,
      overflow: window.editor.scrollWidth > window.editor.clientWidth,
    };
  });
  expect(layout.b).toBeGreaterThan(layout.a);
  expect(layout.overflow).toBe(false);
  const tops = await page
    .locator(".sequence-entry")
    .first()
    .locator(".actions button")
    .evaluateAll((nodes) => nodes.map((e) => e.getBoundingClientRect().top));
  expect(new Set(tops).size).toBe(1);
  await expect(
    page
      .getByRole("group", { name: "Sequence", exact: true })
      .getByLabel("Sound 1 file", { exact: true }),
  ).toBeVisible();
});
test("translations are optional and expanded deliberately; HA updates preserve toggle focus", async ({
  page,
}) => {
  await mount(page);
  await expect(page.getByLabel("Ready to start label")).toBeHidden();
  await page.getByText("Translations", { exact: true }).click();
  await page.getByLabel("Ready to start label").fill("Ready when you are");
  await page.getByLabel("Ready to start label").dispatchEvent("change");
  expect(
    await page.evaluate(() => window.changed.translations.ready_to_start),
  ).toBe("Ready when you are");
  const input = page.getByRole("switch", {
    name: "Show now marker",
    exact: true,
  });
  await input.focus();
  await page.evaluate(
    () =>
      (window.editor.hass = {
        config: { time_zone: "UTC" },
        themes: { darkMode: true },
      }),
  );
  await expect(input).toBeFocused();
});
test("grouped editor light and dark fixture previews", async ({ page }) => {
  await mount(page);
  for (const width of [1000, 360])
    for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((dark) => {
        const s = document.body.style;
        s.setProperty("--ha-card-background", "initial");
        s.setProperty("--card-background-color", dark ? "#242830" : "#fff");
        s.setProperty("--primary-text-color", dark ? "#e2e8f0" : "#202a35");
        s.setProperty("--secondary-text-color", dark ? "#a0acb8" : "#607080");
        s.setProperty("--divider-color", dark ? "#586374" : "#c3cbd4");
        s.background = dark ? "#101820" : "#eef2f6";
        window.editor.hass = {
          config: { time_zone: "UTC" },
          themes: { darkMode: dark },
        };
      }, dark);
      await expect(
        page.getByRole("switch", { name: "Minimalist mode" }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/editor-layout-${width}-${dark ? "dark" : "light"}.png`,
        fullPage: true,
      });
      await page
        .getByRole("group", { name: "Display", exact: true })
        .screenshot({
          path: `test-results/editor-display-${width}-${dark ? "dark" : "light"}.png`,
        });
    }
});

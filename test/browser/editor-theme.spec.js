import { test, expect } from "@playwright/test";
async function mountEditor(page) {
  await page.goto("/test/fixture.html");
  await page.evaluate(async () => {
    await customElements.whenDefined("time-sequence-card");
    window.editor = await customElements
      .get("time-sequence-card")
      .getConfigElement();
    window.editor.setConfig({
      mode: "manual",
      title: "Example",
      phases: [{ label: "Prepare", duration: "00:05:00", icon: "mdi:laptop" }],
    });
    document.querySelector("main").append(window.editor);
  });
}
async function theme(page, dark) {
  await page.evaluate((dark) => {
    const s = document.body.style;
    s.setProperty("--ha-card-background", "initial");
    s.setProperty("--input-fill-color", "initial");
    s.setProperty("--input-ink-color", "initial");
    s.setProperty("--input-idle-line-color", "initial");
    s.setProperty("--card-background-color", dark ? "#242830" : "#ffffff");
    s.setProperty("--primary-text-color", dark ? "#e2e8f0" : "#202a35");
    s.setProperty("--secondary-text-color", dark ? "#b0bac5" : "#607080");
    s.setProperty("--divider-color", dark ? "#586374" : "#c3cbd4");
    s.background = dark ? "#101820" : "#eef2f6";
    window.editor.hass = {
      config: { time_zone: "UTC" },
      themes: { darkMode: dark },
    };
  }, dark);
}
test("editor follows HA light/dark variables and native color scheme independently of OS preference", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await mountEditor(page);
  for (const width of [1000, 360]) {
    await page.setViewportSize({ width, height: 900 });
    for (const dark of [true, false]) {
      await theme(page, dark);
      const title = page.getByLabel("Title", { exact: true });
      await expect(title).toHaveCSS(
        "background-color",
        dark ? "rgb(36, 40, 48)" : "rgb(255, 255, 255)",
      );
      await expect(title).toHaveCSS(
        "color",
        dark ? "rgb(226, 232, 240)" : "rgb(32, 42, 53)",
      );
      await expect(title).toHaveCSS(
        "border-top-color",
        dark ? "rgb(88, 99, 116)" : "rgb(195, 203, 212)",
      );
      await expect(title).toHaveCSS("color-scheme", dark ? "dark" : "light");
      await expect(page.getByLabel("Timing mode")).toHaveCSS(
        "background-color",
        dark ? "rgb(36, 40, 48)" : "rgb(255, 255, 255)",
      );
      await expect(title).toHaveValue("Example");
      await page.screenshot({
        path: `test-results/editor-${dark ? "dark" : "light"}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await theme(page, true);
  await page.evaluate(() => {
    document.body.style.setProperty("--input-fill-color", "#304050");
    document.body.style.setProperty("--input-ink-color", "#d0e0f0");
  });
  await expect(page.getByLabel("Title", { exact: true })).toHaveCSS(
    "background-color",
    "rgb(48, 64, 80)",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveCSS(
    "color",
    "rgb(208, 224, 240)",
  );
});
test("icons are absent from defaults, editor and details while legacy configs still work", async ({
  page,
}) => {
  await mountEditor(page);
  expect(
    await page.evaluate(() =>
      customElements
        .get("time-sequence-card")
        .getStubConfig()
        .phases.some((p) => "icon" in p),
    ),
  ).toBe(false);
  await expect(page.getByLabel(/phase.*icon/i)).toHaveCount(0);
  await page.evaluate(() => {
    const c = document.createElement("time-sequence-card");
    c.setConfig(window.editor.config);
    c.hass = { config: { time_zone: "UTC" } };
    document.querySelector("main").replaceChildren(c);
  });
  await page.locator(".band").click();
  await expect(page.locator(".phase-detail")).toBeVisible();
  await expect(page.locator(".detail-name")).toHaveText("Prepare");
  await expect(page.locator("ha-icon")).toHaveCount(0);
});

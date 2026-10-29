import { test, expect } from "@playwright/test";

test("Now label and phase separators follow the card background across HA themes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.clock.setFixedTime(new Date("2026-01-01T12:02:00Z"));
  await page.goto("/test/fixture.html");
  await page.evaluate(async () => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig({
      mode: "scheduled",
      anchor: { at: "12:00", edge: "start" },
      phases: [
        { label: "Prepare", duration: "00:05:00" },
        { label: "Travel", duration: "00:05:00" },
      ],
    });
    window.card.hass = {
      config: { time_zone: "UTC" },
      locale: { language: "en" },
    };
    document.querySelector("main").append(window.card);
  });
  for (const width of [1000, 360]) {
    await page.setViewportSize({ width, height: 500 });
    for (const minimalist of [false, true]) {
      await page.evaluate(
        (minimalist) =>
          window.card.setConfig({ ...window.card.config, minimalist }),
        minimalist,
      );
      for (const [background, override, expected, foreground] of [
        ["#242830", null, "rgb(36, 40, 48)", "#e2e8f0"],
        ["#ffffff", null, "rgb(255, 255, 255)", "#202a35"],
        ["#242830", "#304050", "rgb(48, 64, 80)", "#e2e8f0"],
      ]) {
        await page.evaluate(
          ({ background, override, foreground }) => {
            const s = document.body.style;
            s.setProperty("--ha-card-background", override ?? "initial");
            s.setProperty("--card-background-color", background);
            s.setProperty("--primary-text-color", foreground);
            s.background = background;
          },
          { background, override, foreground },
        );
        await expect(page.locator(".now-label")).toBeVisible();
        await expect(page.locator("ha-card")).toHaveCSS(
          "background-color",
          expected,
        );
        await expect(page.locator(".now-label")).toHaveCSS(
          "background-color",
          expected,
        );
        await expect(page.locator(".band").first()).toHaveCSS(
          "border-inline-end-color",
          expected,
        );
        if (
          width === 360 &&
          minimalist &&
          override === null &&
          background === "#242830"
        )
          await page.screenshot({ path: "test-results/now-label-dark.png" });
      }
    }
  }
});

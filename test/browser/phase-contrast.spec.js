import { test, expect } from "@playwright/test";

test("only phase fills fade while inactive labels retain theme contrast", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-01-01T12:07:00Z"));
  await page.goto("/test/fixture.html");
  await page.evaluate(async () => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig({
      mode: "scheduled",
      anchor: { at: "12:00", edge: "start" },
      phases: [
        { label: "Completed", duration: "00:05:00", color: "#ffffff" },
        { label: "Current", duration: "00:05:00", color: "#68c7d7" },
        { label: "Upcoming", duration: "00:05:00", color: "#000000" },
      ],
    });
    window.card.hass = { config: { time_zone: "UTC" } };
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
      for (const dark of [true, false]) {
        await page.evaluate((dark) => {
          const s = document.body.style;
          s.setProperty("--ha-card-background", "initial");
          s.setProperty(
            "--card-background-color",
            dark ? "#242830" : "#ffffff",
          );
          s.setProperty("--primary-text-color", dark ? "#e2e8f0" : "#202a35");
          s.background = dark ? "#101820" : "#eef2f6";
        }, dark);
        await expect(page.locator(".status-label")).toHaveText("Current");
        for (const i of [0, 2]) {
          const band = page.locator(".band").nth(i);
          await expect(band).toHaveCSS("opacity", "1");
          await expect(band.locator(".band-label")).toBeVisible();
          await expect(band.locator(".band-label")).toHaveCSS(
            "color",
            dark ? "rgb(226, 232, 240)" : "rgb(32, 42, 53)",
          );
        }
        const fills = await page.evaluate(() =>
          [...window.card.shadowRoot.querySelectorAll(".band")].map((b) =>
            Number(getComputedStyle(b, "::before").opacity),
          ),
        );
        expect(
          await page.evaluate(
            () =>
              getComputedStyle(
                window.card.shadowRoot.querySelector(".band"),
                "::before",
              ).transitionDuration,
          ),
        ).toBe("0s");
        expect(fills[1]).toBe(1);
        expect(fills[0]).toBeLessThan(fills[2]);
        expect(fills[2]).toBeLessThanOrEqual(0.25);
        await page.locator(".band").nth(2).click();
        await expect(page.locator(".status-label")).toHaveText("Current");
        await expect(
          page.locator(".band").nth(2).locator(".band-label"),
        ).toHaveCSS("color", dark ? "rgb(226, 232, 240)" : "rgb(32, 42, 53)");
        await page.getByRole("button", { name: "Close phase details" }).click();
        if (width === 360 && minimalist)
          await page.screenshot({
            path: `test-results/phase-contrast-${dark ? "dark" : "light"}.png`,
          });
      }
    }
  }
});

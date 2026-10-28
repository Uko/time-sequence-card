import { test, expect } from "@playwright/test";
for (const minimalist of [false, true]) {
  test(`phase inspection leaves live status unchanged (${minimalist ? "minimalist" : "full"})`, async ({
    page,
  }) => {
    await page.goto("/test/fixture.html");
    for (const scenario of [
      { mode: "scheduled", at: "2026-01-01T12:02:00Z", label: "Prepare" },
      { mode: "scheduled", at: "2026-01-01T11:00:00Z", label: "Start in 1h" },
      { mode: "scheduled", at: "2026-01-01T13:00:00Z", label: "Start in 23h" },
      { mode: "manual", at: "2026-01-01T12:00:00Z", label: "Ready to start" },
      {
        mode: "manual",
        at: "2026-01-01T12:00:00Z",
        startedAt: "2026-01-01T11:00:00Z",
        label: "Ready to start",
      },
    ]) {
      await page.clock.setFixedTime(new Date(scenario.at));
      await page.evaluate(
        async ({ scenario, minimalist }) => {
          await customElements.whenDefined("time-sequence-card");
          window.card = document.createElement("time-sequence-card");
          window.card.setConfig({
            mode: scenario.mode,
            minimalist,
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
          if (scenario.startedAt)
            window.card.startedAt = Date.parse(scenario.startedAt);
          document.querySelector("main").replaceChildren(window.card);
          window.card.tick();
        },
        { scenario, minimalist },
      );
      await page.mouse.move(0, 0);
      await expect(page.locator(".status-label")).toHaveText(scenario.label);
      const remaining = await page.locator(".remaining").textContent();
      const band = page.locator(".band").nth(1);
      for (const action of ["hover", "focus", "click"]) {
        await band[action]();
        await expect(page.locator(".phase-detail")).toBeVisible();
        await expect(page.locator(".detail-name")).toHaveText("Travel");
        await expect(page.locator(".status-label")).toHaveText(scenario.label);
        await expect(page.locator(".remaining")).toHaveText(remaining);
      }
      if (scenario.label === "Prepare") {
        await page.clock.setFixedTime(new Date("2026-01-01T12:06:00Z"));
        await page.evaluate(() => window.card.tick());
        await expect(page.locator(".status-label")).toHaveText("Travel");
      }
      await page.keyboard.press("Escape");
    }
  });
}

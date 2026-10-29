import { test, expect } from "@playwright/test";
async function mount(page) {
  await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
  await page.goto("/test/fixture.html");
  await page.evaluate(async () => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig({
      mode: "manual",
      title: "Example",
      phases: [
        { label: "Current", duration: "00:05:00" },
        { label: "Prepare the presentation", duration: "00:05:00" },
      ],
    });
    window.card.hass = { config: { time_zone: "UTC" } };
    document.querySelector("main").append(window.card);
  });
}
test("event text scales independently, retaining responsive defaults and the manual session", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const started = await page.evaluate(() => window.card.startedAt);
  for (const width of [1000, 360]) {
    await page.setViewportSize({ width, height: 600 });
    for (const minimalist of [false, true]) {
      await page.evaluate(
        (minimalist) =>
          window.card.setConfig({
            ...window.card.config,
            minimalist,
            event_text_scale: 1,
          }),
        minimalist,
      );
      const unchanged = await page.evaluate(() =>
        Object.fromEntries(
          [".status-label", ".now-label", ".boundary"].map((s) => [
            s,
            getComputedStyle(window.card.shadowRoot.querySelector(s)).fontSize,
          ]),
        ),
      );
      for (const scale of [0.5, 0.8, 1, 1.2, 2, 3]) {
        await page.evaluate(
          (scale) =>
            window.card.setConfig({
              ...window.card.config,
              event_text_scale: scale,
            }),
          scale,
        );
        const label = page.locator(".band-label").nth(1);
        await expect(label).toHaveCSS(
          "font-size",
          `${(width === 360 ? 11 : 13) * scale}px`,
        );
        expect(await page.evaluate(() => window.card.startedAt)).toBe(started);
        expect(
          await page.evaluate(() =>
            Object.fromEntries(
              [".status-label", ".now-label", ".boundary"].map((s) => [
                s,
                getComputedStyle(window.card.shadowRoot.querySelector(s))
                  .fontSize,
              ]),
            ),
          ),
        ).toEqual(unchanged);
        if (width === 360 && minimalist && [0.5, 2].includes(scale)) {
          const clipped = await label.evaluate(
            (e) => e.scrollWidth > e.clientWidth,
          );
          expect(clipped).toBe(scale === 2);
          await page.screenshot({
            path: `test-results/event-text-scale-${scale}.png`,
          });
        }
      }
    }
  }
});
test("editor emits numeric event text scale and clearing restores the default", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(async () => {
    window.editor = await customElements
      .get("time-sequence-card")
      .getConfigElement();
    window.editor.setConfig(window.card.config);
    window.editor.addEventListener(
      "config-changed",
      (e) => (window.changed = e.detail.config),
    );
    document.querySelector("main").replaceChildren(window.editor);
  });
  const input = page.getByLabel("Event text scale", { exact: true });
  await expect(input).toHaveValue("1");
  await input.fill("1.2");
  await input.dispatchEvent("change");
  expect(await page.evaluate(() => window.changed.event_text_scale)).toBe(1.2);
  await input.fill("");
  await input.dispatchEvent("change");
  expect(
    await page.evaluate(() => window.changed.event_text_scale),
  ).toBeUndefined();
});

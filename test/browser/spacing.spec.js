import { test, expect } from "@playwright/test";

test("bottom spacing matches card padding rather than a spare time-axis row", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-01-01T12:07:00Z"));
  await page.goto("/test/fixture.html");
  for (const width of [1000, 360])
    for (const minimalist of [false, true])
      for (const time of ["11:59:00", "12:07:00", "12:15:00"]) {
        await page.setViewportSize({ width, height: 800 });
        await page.clock.setFixedTime(new Date(`2026-01-01T${time}Z`));
        const spacing = await page.evaluate(async (minimalist) => {
          await customElements.whenDefined("time-sequence-card");
          const card = document.createElement("time-sequence-card");
          card.setConfig({
            mode: "scheduled",
            minimalist,
            anchor: { at: "12:00", edge: "start" },
            phases: [
              { label: "Setup", duration: "00:01:00" },
              { label: "Talk", duration: "00:10:00" },
              { label: "Questions", duration: "00:03:00" },
            ],
          });
          card.hass = { config: { time_zone: "UTC" } };
          document.querySelector("main").replaceChildren(card);
          card.layoutAxis();
          const root = card.shadowRoot,
            frame = root.querySelector("ha-card"),
            axis = root.querySelector(".axis");
          const style = getComputedStyle(frame),
            labels = [...axis.querySelectorAll(".boundary,.now-label")].filter(
              (n) => !n.hidden && getComputedStyle(n).visibility !== "hidden",
            );
          return {
            bottomGap:
              frame.getBoundingClientRect().bottom -
              Math.max(...labels.map((n) => n.getBoundingClientRect().bottom)),
            padding: Number.parseFloat(style.paddingBottom),
            border: Number.parseFloat(style.borderBottomWidth),
            axisHeight: axis.getBoundingClientRect().height,
            labelHeight: labels[0].getBoundingClientRect().height,
          };
        }, minimalist);
        console.log(JSON.stringify({ width, minimalist, time, ...spacing }));
        expect(spacing.bottomGap).toBeLessThanOrEqual(
          spacing.padding + spacing.border + 1,
        );
        expect(spacing.bottomGap).toBeGreaterThanOrEqual(
          spacing.padding + spacing.border - 1,
        );
      }
});

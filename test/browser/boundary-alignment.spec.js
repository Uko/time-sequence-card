import { test, expect } from "@playwright/test";
async function mount(page, extra = {}) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
  await page.goto("/test/fixture.html");
  await page.evaluate(async (extra) => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig({
      mode: "scheduled",
      anchor: { at: "12:00", edge: "start" },
      phases: [
        { label: "Setup", duration: "00:01:00" },
        { label: "Talk", duration: "00:02:00" },
        { label: "Questions", duration: "00:01:00" },
      ],
      ...extra,
    });
    window.card.hass = { config: { time_zone: "UTC" } };
    document.querySelector("main").append(window.card);
  }, extra);
}
test("active fill outline inherits endpoint corners, including a single-phase timeline", async ({
  page,
}) => {
  await mount(page);
  for (const width of [1000, 360]) {
    await page.setViewportSize({ width, height: 500 });
    for (const count of [3, 1]) {
      await page.evaluate(
        (count) =>
          window.card.setConfig({
            ...window.card.config,
            phases: [
              { label: "Setup", duration: "00:01:00" },
              { label: "Talk", duration: "00:02:00" },
              { label: "Questions", duration: "00:01:00" },
            ].slice(0, count),
          }),
        count,
      );
      for (const [at, index, corners] of [
        ["12:00:00", 0, ["borderTopLeftRadius", "borderBottomLeftRadius"]],
        ...(count > 1
          ? [
              [
                "12:03:00",
                2,
                ["borderTopRightRadius", "borderBottomRightRadius"],
              ],
            ]
          : []),
      ]) {
        await page.clock.setFixedTime(new Date(`2026-01-01T${at}Z`));
        await page.evaluate(() => window.card.tick());
        await expect(page.locator(".band").nth(index)).toHaveClass(/active/);
        const radii = await page
          .locator(".band")
          .nth(index)
          .evaluate(
            (e, corners) =>
              corners.map((k) => [
                getComputedStyle(e)[k],
                getComputedStyle(e, "::before")[k],
              ]),
            corners,
          );
        for (const [outer, fill] of radii) {
          expect(outer).toBe("8px");
          expect(fill).toBe(outer);
        }
        if (count === 1) {
          const r = await page
            .locator(".band")
            .evaluate((e) => getComputedStyle(e, "::before").borderRadius);
          expect(r).toBe("8px");
        }
      }
    }
  }
});
test("cursor and visible separator centres meet at the exact phase transition", async ({
  page,
}) => {
  await mount(page, {
    phases: [
      { label: "Setup", duration: "00:01:00" },
      { label: "Talk", duration: "00:02:00" },
      { label: "Questions", duration: "00:00:47" },
    ],
  });
  for (const width of [1000, 360])
    for (const minimalist of [false, true])
      for (const padding of [0, 2]) {
        await page.setViewportSize({ width, height: 500 });
        await page.evaluate(
          ({ minimalist, padding }) =>
            window.card.setConfig({
              ...window.card.config,
              minimalist,
              padding_before: padding,
              padding_after: padding,
            }),
          { minimalist, padding },
        );
        for (const [at, label] of [
          ["12:00:59", "Setup"],
          ["12:01:00", "Talk"],
          ["12:03:00", "Questions"],
        ]) {
          await page.clock.setFixedTime(new Date(`2026-01-01T${at}Z`));
          await page.evaluate(() => window.card.tick());
          await expect(page.locator(".status-label")).toHaveText(label);
          if (at === "12:00:59") continue;
          const g = await page.evaluate(() => {
            const root = window.card.shadowRoot,
              bands = [...root.querySelectorAll(".band")],
              i = bands.findIndex((e) => e.classList.contains("active")),
              before = bands[i - 1],
              after = bands[i],
              a = before.getBoundingClientRect(),
              b = after.getBoundingClientRect(),
              cursor = root.querySelector(".cursor").getBoundingClientRect(),
              left =
                a.right - parseFloat(getComputedStyle(before).borderRightWidth),
              right =
                b.left + parseFloat(getComputedStyle(after).borderLeftWidth);
            return {
              boundary: b.left,
              separator: (left + right) / 2,
              cursor: (cursor.left + cursor.right) / 2,
              gap: right - left,
            };
          });
          expect(g.gap).toBeCloseTo(2, 1);
          expect(g.separator).toBeCloseTo(g.boundary, 1);
          expect(g.cursor).toBeCloseTo(g.boundary, 1);
        }
      }
});

test("light and dark visual fixtures show rounded first, last and single-phase highlights", async ({
  page,
}) => {
  await mount(page, { minimalist: true, height: 140 });
  await page.evaluate(() => {
    const main = document.querySelector("main");
    main.style.cssText = "display:grid;gap:20px";
    for (const single of [false, true]) {
      const card = document.createElement("time-sequence-card");
      card.setConfig({
        ...window.card.config,
        anchor: { at: single ? "11:59" : "11:57", edge: "start" },
        ...(single
          ? { phases: [{ label: "Single phase", duration: "00:04:00" }] }
          : {}),
      });
      card.hass = { config: { time_zone: "UTC" } };
      main.append(card);
    }
  });
  for (const width of [1000, 360]) {
    await page.setViewportSize({ width, height: 900 });
    for (const dark of [false, true]) {
      await page.evaluate((dark) => {
        const s = document.body.style;
        s.setProperty("--ha-card-background", "initial");
        s.setProperty("--card-background-color", dark ? "#242830" : "#ffffff");
        s.setProperty("--primary-text-color", dark ? "#e2e8f0" : "#202a35");
        s.setProperty("--secondary-text-color", dark ? "#a0acb8" : "#607080");
        s.background = dark ? "#101820" : "#eef2f6";
      }, dark);
      await expect(page.locator(".band.active")).toHaveCount(3);
      await page
        .locator("main")
        .screenshot({
          path: `test-results/boundary-alignment-${width}-${dark ? "dark" : "light"}.png`,
        });
    }
  }
});

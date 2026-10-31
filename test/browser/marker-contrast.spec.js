import { test, expect } from "@playwright/test";
async function mount(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-01-01T12:01:30Z"));
  await page.goto("/test/fixture.html");
  await page.evaluate(async () => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig({
      mode: "scheduled",
      anchor: { at: "12:00", edge: "start" },
      minimalist: true,
      phases: [
        { label: "Prepare", duration: "00:01:00", color: "#4fc3f7" },
        { label: "Current step", duration: "00:01:00", color: "#ffd54f" },
        { label: "Finish", duration: "00:01:00", color: "#aed581" },
      ],
    });
    window.card.hass = { config: { time_zone: "UTC" } };
    document.querySelector("main").append(window.card);
  });
}
async function theme(page, dark) {
  await page.evaluate((dark) => {
    const s = document.body.style;
    s.setProperty("--ha-card-background", "initial");
    s.setProperty("--card-background-color", dark ? "#242830" : "#ffffff");
    s.setProperty("--primary-text-color", dark ? "#e2e8f0" : "#202a35");
    s.setProperty("--secondary-text-color", dark ? "#a0acb8" : "#607080");
    s.background = dark ? "#101820" : "#eef2f6";
  }, dark);
}
test("theme cursor and half-intensity shadow preserve fills and alignment", async ({
  page,
}) => {
  await mount(page);
  for (const width of [1000, 360])
    for (const dark of [true, false]) {
      await page.setViewportSize({ width, height: 600 });
      await theme(page, dark);
      for (const color of [
        "#ffd54f",
        "#4fc3f7",
        "#aed581",
        "#ce93d8",
        "#ff0000",
        "#ffffff",
        "#000000",
        "#777777",
        "#888888",
      ]) {
        await page.evaluate(
          (color) =>
            window.card.setConfig({
              ...window.card.config,
              phases: window.card.config.phases.map((p, i) =>
                i === 1 ? { ...p, color } : p,
              ),
            }),
          color,
        );
        const colors = await page.evaluate(() => {
          const r = window.card.shadowRoot,
            cursor = r.querySelector(".cursor"),
            halo = r.querySelector(".cursor-shadow");
          const probe = document.createElement("span");
          probe.style.background = "var(--primary-text-color,#202a35)";
          probe.style.boxShadow = `0 0 3px 1px color-mix(in srgb, ${getComputedStyle(r.querySelector("ha-card")).backgroundColor} 50%, transparent)`;
          r.append(probe);
          const expected = getComputedStyle(probe);
          const result = {
            core: getComputedStyle(cursor).backgroundColor,
            edge: getComputedStyle(cursor).boxShadow,
            halo: getComputedStyle(halo, "::before").boxShadow,
            haloCore: getComputedStyle(halo, "::before").backgroundColor,
            hidden: halo.hidden,
            expectedCore: expected.backgroundColor,
            expectedHalo: expected.boxShadow,
            fill: getComputedStyle(r.querySelector(".band.active"), "::before")
              .backgroundColor,
          };
          probe.remove();
          return result;
        });
        expect(colors.core).toBe(colors.expectedCore);
        expect(colors.haloCore).toBe(colors.expectedCore);
        expect(colors.edge).toBe("none");
        expect(colors.hidden).toBe(false);
        expect(colors.halo).toBe(colors.expectedHalo);
        const expectedRgb = color
          .slice(1)
          .match(/../g)
          .map((x) => parseInt(x, 16));
        expect(colors.fill).toBe(`rgb(${expectedRgb.join(", ")})`);
        const alignment = await page.locator(".cursor").evaluate((e) => {
          const c = e.getBoundingClientRect(),
            t = e.parentElement.getBoundingClientRect();
          return {
            center: (c.left + c.right) / 2,
            expected: t.left + t.width / 2,
          };
        });
        expect(alignment.center).toBeCloseTo(alignment.expected, 1);
      }
    }
});
test("active outline is a single theme-foreground stroke without an inner edge", async ({
  page,
}) => {
  await mount(page);
  for (const dark of [false, true]) {
    await theme(page, dark);
    const shadow = await page
      .locator(".band.active")
      .evaluate((e) => getComputedStyle(e, "::before").boxShadow);
    expect(shadow).toContain(dark ? "rgb(226, 232, 240)" : "rgb(32, 42, 53)");
    expect(shadow.match(/inset/g)).toHaveLength(1);
    await expect(page.locator(".band.active")).toHaveCSS("opacity", "1");
  }
});
test("light and dark visual contrast previews retain configured fill colours", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => {
    const main = document.querySelector("main");
    main.style.cssText = "display:grid;gap:20px";
    for (const color of ["#4fc3f7", "#101820"]) {
      const card = document.createElement("time-sequence-card");
      card.setConfig({
        ...window.card.config,
        phases: window.card.config.phases.map((p, i) =>
          i === 1 ? { ...p, color } : p,
        ),
      });
      card.hass = { config: { time_zone: "UTC" } };
      main.append(card);
    }
  });
  for (const width of [1000, 360])
    for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: 850 });
      await theme(page, dark);
      await page.locator("main").screenshot({
        path: `test-results/marker-contrast-${width}-${dark ? "dark" : "light"}.png`,
      });
    }
});

test("shadow responds to theme changes and explicit tinted card backgrounds", async ({
  page,
}) => {
  await mount(page);
  for (const [ink, background, override] of [
    ["#e2e8f0", "#242830", false],
    ["#202a35", "#ffffff", false],
    ["#493325", "#f7ebdf", true],
  ]) {
    await page.evaluate(
      ({ ink, background, override }) => {
        const s = document.body.style;
        s.setProperty("--primary-text-color", ink);
        s.setProperty(
          "--card-background-color",
          override ? "#ff00ff" : background,
        );
        s.setProperty(
          "--ha-card-background",
          override ? background : "initial",
        );
      },
      { ink, background, override },
    );
    const styles = await page.locator(".cursor-shadow").evaluate((e) => {
      const p = getComputedStyle(e, "::before");
      return { ink: p.backgroundColor, shadow: p.boxShadow };
    });
    const expectedInk = ink
      .slice(1)
      .match(/../g)
      .map((x) => parseInt(x, 16));
    expect(styles.ink).toBe(`rgb(${expectedInk.join(", ")})`);
    const expected = await page.evaluate((background) => {
      const probe = document.createElement("span");
      probe.style.boxShadow = `0 0 3px 1px color-mix(in srgb, ${background} 50%, transparent)`;
      document.body.append(probe);
      const s = getComputedStyle(probe).boxShadow;
      probe.remove();
      return s;
    }, background);
    expect(styles.shadow).toBe(expected);
  }
});
test("shadow is clipped to event bounds and follows the cursor through padded windows", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() =>
    window.card.setConfig({
      ...window.card.config,
      padding_before: 2,
      padding_after: 2,
    }),
  );
  for (const [clock, active, visible] of [
    ["11:59:30", false, true],
    ["12:00:00", true, true],
    ["12:00:00.001", true, true],
    ["12:01:00", true, true],
    ["12:02:59.999", true, true],
    ["12:03:00", false, true],
    ["12:05:00", false, false],
  ]) {
    await page.clock.setFixedTime(new Date(`2026-01-01T${clock}Z`));
    await page.evaluate(() => window.card.tick());
    const geometry = await page.evaluate(() => {
      const r = window.card.shadowRoot,
        cursor = r.querySelector(".cursor"),
        halo = r.querySelector(".cursor-shadow"),
        bands = [...r.querySelectorAll(".band")],
        line = cursor.getBoundingClientRect(),
        box = halo.getBoundingClientRect(),
        first = bands[0].getBoundingClientRect(),
        last = bands.at(-1).getBoundingClientRect(),
        p = getComputedStyle(halo, "::before");
      return {
        cursorVisible: !cursor.hidden,
        haloVisible: !halo.hidden,
        overflow: getComputedStyle(halo).overflow,
        bounds: [box.left, box.right, box.top, box.bottom],
        expected: [first.left, last.right, first.top, first.bottom],
        center: (line.left + line.right) / 2,
        haloCenter: box.left + parseFloat(p.left),
      };
    });
    expect(geometry.cursorVisible).toBe(visible);
    expect(geometry.haloVisible).toBe(active);
    if (active) {
      expect(geometry.overflow).toBe("hidden");
      geometry.bounds.forEach((v, i) =>
        expect(v).toBeCloseTo(geometry.expected[i], 1),
      );
      expect(geometry.haloCenter).toBeCloseTo(geometry.center, 1);
    }
  }
});
test("show_now and manual lifecycle control both line and shadow", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() =>
    window.card.setConfig({ ...window.card.config, show_now: false }),
  );
  await expect(page.locator(".cursor")).toBeHidden();
  await expect(page.locator(".cursor-shadow")).toBeHidden();
  await page.evaluate(() =>
    window.card.setConfig({
      ...window.card.config,
      show_now: true,
      mode: "manual",
    }),
  );
  await expect(page.locator(".cursor")).toBeHidden();
  await expect(page.locator(".cursor-shadow")).toBeHidden();
  await page.locator(".start").click();
  await expect(page.locator(".cursor")).toBeVisible();
  await expect(page.locator(".cursor-shadow")).toBeVisible();
  await page.locator(".reset").click();
  await expect(page.locator(".cursor")).toBeHidden();
  await expect(page.locator(".cursor-shadow")).toBeHidden();
});

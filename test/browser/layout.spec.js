import { test, expect } from "@playwright/test";
const phases = [
  { label: "A very short setup window", duration: "00:01:00" },
  { label: "Talk", duration: "00:10:00" },
  { label: "Questions", duration: "00:03:00" },
];
async function mount(page, extra = {}) {
  await page.goto("/test/fixture.html");
  await page.evaluate(
    async (config) => {
      await customElements.whenDefined("time-sequence-card");
      window.card = document.createElement("time-sequence-card");
      window.card.setConfig(config);
      window.card.hass = { config: { time_zone: "UTC" } };
      document.querySelector("main").append(window.card);
    },
    {
      mode: "scheduled",
      anchor: { at: "12:14", edge: "end" },
      phases,
      ...extra,
    },
  );
}
test("default layout removes the duplicate legend and exposes details on hover, tap and keyboard", async ({
  page,
}) => {
  await mount(page);
  await expect(page.locator(".legend")).toHaveCount(0);
  await expect(page.locator(".phase-detail")).toBeHidden();
  await page.locator(".band").first().hover();
  await expect(page.locator(".phase-detail")).toBeVisible();
  await expect(page.locator(".detail-name")).toContainText(
    "A very short setup window",
  );
  await expect(page.locator(".detail-duration")).toContainText("1:00");
  await page.locator(".band").first().click();
  await page.mouse.move(5, 5);
  await expect(page.locator(".phase-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".phase-detail")).toBeHidden();
  await page.locator(".band").nth(1).focus();
  await expect(page.locator(".detail-name")).toHaveText("Talk");
  await page.keyboard.press("Escape");
  await expect(page.locator(".phase-detail")).toBeHidden();
});
test("minimalist mode focuses space on the bar without removing manual controls", async ({
  page,
}) => {
  await mount(page, { mode: "manual", minimalist: true });
  await expect(page.locator("header")).toBeHidden();
  await expect(page.locator(".remaining")).toBeHidden();
  await expect(page.locator(".window-label")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible();
  const size = await page.locator("ha-card").boundingBox();
  expect(size.height).toBeLessThan(190);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".status-label")).toHaveText(
    "A very short setup window",
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator(".status-label")).toHaveText("Ready to start");
});
test("NOW is below the strip and suppresses colliding ticks at either endpoint and in dense timelines", async ({
  page,
}) => {
  await page.setViewportSize({ width: 560, height: 800 });
  await page.clock.setFixedTime(new Date("2026-01-01T12:00:01Z"));
  await mount(page, {
    minimalist: true,
    phases: Array.from({ length: 20 }, (_, i) => ({
      label: `Phase ${i + 1}`,
      duration: "00:01:00",
    })),
    anchor: { at: "12:00", edge: "start" },
  });
  for (const instant of ["12:00:01", "12:10:00", "12:19:59"]) {
    await page.clock.setFixedTime(new Date(`2026-01-01T${instant}Z`));
    await page.evaluate(() => {
      window.card.tick();
      window.card.layoutAxis();
    });
    await expect(page.locator(".now-label")).toContainText("Now");
    const overlap = await page.evaluate(() => {
      const root = window.card.shadowRoot,
        track = root.querySelector(".track").getBoundingClientRect();
      const labels = [...root.querySelectorAll(".boundary,.now-label")]
        .filter((n) => !n.hidden && getComputedStyle(n).visibility !== "hidden")
        .map((n) => n.getBoundingClientRect())
        .sort((a, b) => a.left - b.left);
      return labels.some(
        (r, i) =>
          r.top < track.bottom ||
          r.left < 0 ||
          r.right > innerWidth ||
          (i > 0 && r.left < labels[i - 1].right),
      );
    });
    expect(overlap).toBe(false);
  }
});
test("touch details pin without hover and close on an outside tap", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    hasTouch: true,
    isMobile: true,
    viewport: { width: 360, height: 700 },
  });
  try {
    const page = await context.newPage();
    await mount(page, { minimalist: true });
    await page.locator(".band").first().tap();
    await expect(page.locator(".phase-detail")).toBeVisible();
    await expect(page.locator(".detail-name")).toHaveText(
      "A very short setup window",
    );
    await page.screenshot({
      path: "test-results/touch-details.png",
      fullPage: true,
    });
    await page.touchscreen.tap(5, 5);
    await expect(page.locator(".phase-detail")).toBeHidden();
  } finally {
    await context.close();
  }
});
test("axis layout coalesces geometry work and cancels its frame on disconnect", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-01-01T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T12:01:00Z"));
  await mount(page);
  const result = await page.evaluate(() => {
    const card = window.card;
    const frame = card.layoutFrame;
    card.scheduleLayout();
    card.scheduleLayout();
    const same = card.layoutFrame === frame && frame !== 0;
    card.remove();
    const cancelled = card.layoutFrame === 0;
    document.querySelector("main").append(card);
    const restarted = card.layoutFrame !== 0;
    return { same, cancelled, restarted };
  });
  expect(result).toEqual({ same: true, cancelled: true, restarted: true });
});
test("minimalist action tracks the NOW cursor above the strip, with safe edge clamping", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-01-01T12:07:00Z"));
  await mount(page, { minimalist: true });
  for (const [instant, centered] of [
    ["12:00:01", false],
    ["12:07:00", true],
    ["12:13:59", false],
  ]) {
    await page.clock.setFixedTime(new Date(`2026-01-01T${instant}Z`));
    const geometry = await page.evaluate(() => {
      window.card.tick();
      window.card.layoutAxis();
      const root = window.card.shadowRoot;
      const label = root.querySelector(".status-label").getBoundingClientRect();
      const cursor = root.querySelector(".cursor").getBoundingClientRect();
      const track = root.querySelector(".track").getBoundingClientRect();
      return {
        label: {
          left: label.left,
          right: label.right,
          bottom: label.bottom,
          center: (label.left + label.right) / 2,
        },
        cursor: cursor.left,
        track: { left: track.left, right: track.right, top: track.top },
      };
    });
    expect(geometry.label.bottom).toBeLessThanOrEqual(geometry.track.top);
    expect(geometry.label.left).toBeGreaterThanOrEqual(geometry.track.left - 1);
    expect(geometry.label.right).toBeLessThanOrEqual(geometry.track.right + 1);
    if (centered)
      expect(Math.abs(geometry.label.center - geometry.cursor)).toBeLessThan(2);
  }
});
test("manual controls sit top-right above the bar without overlapping action labels", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
  for (const width of [1000, 360])
    for (const minimalist of [false, true]) {
      await page.setViewportSize({ width, height: 800 });
      await mount(page, { mode: "manual", minimalist });
      await page.getByRole("button", { name: "Start", exact: true }).click();
      for (const offset of [0, 420000, 839000]) {
        await page.clock.setFixedTime(
          new Date(Date.parse("2026-01-01T12:00:00Z") + offset),
        );
        const geometry = await page.evaluate(() => {
          window.card.tick();
          window.card.layoutAxis();
          const root = window.card.shadowRoot;
          const controls = root
              .querySelector(".controls")
              .getBoundingClientRect(),
            label = root.querySelector(".status-label").getBoundingClientRect(),
            track = root.querySelector(".track").getBoundingClientRect();
          return {
            controls: {
              right: controls.right,
              bottom: controls.bottom,
              left: controls.left,
              top: controls.top,
            },
            label: {
              left: label.left,
              right: label.right,
              top: label.top,
              bottom: label.bottom,
            },
            track: { right: track.right, top: track.top },
          };
        });
        expect(
          Math.abs(geometry.controls.right - geometry.track.right),
        ).toBeLessThan(2);
        expect(geometry.controls.bottom).toBeLessThanOrEqual(
          geometry.track.top,
        );
        const overlap =
          geometry.label.left < geometry.controls.right &&
          geometry.label.right > geometry.controls.left &&
          geometry.label.top < geometry.controls.bottom &&
          geometry.label.bottom > geometry.controls.top;
        expect(overlap).toBe(false);
      }
      if (width === 360 && minimalist)
        await page.screenshot({
          path: "test-results/manual-minimalist-narrow.png",
          fullPage: true,
        });
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await expect(page.locator(".status-label")).toHaveText("Ready to start");
      await page.clock.setFixedTime(new Date("2026-01-01T12:00:00Z"));
    }
});
test("minimalist is editable and rejects malformed YAML values", async ({
  page,
}) => {
  await mount(page);
  const malformed = await page.evaluate(() => {
    try {
      window.card.setConfig({ ...window.card.config, minimalist: "yes" });
      return false;
    } catch {
      return true;
    }
  });
  expect(malformed).toBe(true);
  await page.evaluate(async () => {
    const editor = await customElements
      .get("time-sequence-card")
      .getConfigElement();
    editor.setConfig({
      mode: "manual",
      phases: [{ label: "Phase", duration: "00:01:00" }],
    });
    editor.addEventListener(
      "config-changed",
      (e) => (window.changed = e.detail.config),
    );
    document.querySelector("main").replaceChildren(editor);
  });
  await page.getByLabel("Minimalist mode").check();
  expect(await page.evaluate(() => window.changed.minimalist)).toBe(true);
});

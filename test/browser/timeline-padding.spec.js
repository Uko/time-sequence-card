import { test, expect } from "@playwright/test";
async function mount(page, extra = {}) {
  await page.clock.setFixedTime(new Date("2026-01-01T11:57:30Z"));
  await page.goto("/test/fixture.html");
  await page.evaluate(async (extra) => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig({
      mode: "scheduled",
      anchor: { at: "12:00", edge: "start" },
      minimalist: true,
      padding_before: 5,
      padding_after: 5,
      phases: [
        { label: "Prepare", duration: "00:05:00" },
        { label: "Travel", duration: "00:05:00" },
      ],
      ...extra,
    });
    window.card.hass = {
      config: { time_zone: "UTC" },
      locale: { language: "en" },
    };
    document.querySelector("main").append(window.card);
  }, extra);
}
test("cursor traverses neutral padding around unchanged event boundaries", async ({
  page,
}) => {
  await mount(page);
  const positions = await page.evaluate(() =>
    [...window.card.shadowRoot.querySelectorAll(".band")].map((b) => [
      parseFloat(b.style.left),
      parseFloat(b.style.width),
    ]),
  );
  expect(positions).toEqual([
    [25, 25],
    [50, 25],
  ]);
  for (const [at, left, label, visible] of [
    ["11:54:59", 0, "Start in 6m", false],
    ["11:55:00", 0, "Start in 5m", true],
    ["11:57:30", 12.5, "Start in 3m", true],
    ["12:00:00", 25, "Prepare", true],
    ["12:10:00", 75, "Start in 24h", true],
    ["12:12:30", 87.5, "Start in 24h", true],
    ["12:15:00", 100, "Start in 24h", false],
  ]) {
    await page.clock.setFixedTime(new Date("2026-01-01T" + at + "Z"));
    await page.evaluate(() => window.card.tick());
    await expect(page.locator(".status-label")).toHaveText(label);
    await expect(page.locator(".cursor")).toBeVisible({ visible });
    expect(
      await page.evaluate(() =>
        parseFloat(window.card.shadowRoot.querySelector(".cursor").style.left),
      ),
    ).toBeCloseTo(left, 2);
    if (at === "11:57:30")
      await page.screenshot({
        path: "test-results/timeline-padding-before.png",
      });
    if (at === "12:12:30")
      await page.screenshot({
        path: "test-results/timeline-padding-after.png",
      });
  }
  await expect(page.locator(".boundary").first()).toHaveText("12:00");
  await expect(page.locator(".boundary").last()).toHaveText("12:10");
  await page.evaluate(() =>
    window.card.setConfig({ ...window.card.config, show_now: false }),
  );
  await expect(page.locator(".cursor")).toBeHidden();
});
test("manual padding never invents a start or resets a running session", async ({
  page,
}) => {
  await mount(page, { mode: "manual" });
  await expect(page.locator(".cursor")).toBeHidden();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const started = await page.evaluate(() => window.card.startedAt);
  expect(
    await page.evaluate(() =>
      parseFloat(window.card.shadowRoot.querySelector(".cursor").style.left),
    ),
  ).toBe(25);
  await page.evaluate(() =>
    window.card.setConfig({
      ...window.card.config,
      padding_before: 10,
      padding_after: 10,
    }),
  );
  expect(await page.evaluate(() => window.card.startedAt)).toBe(started);
  await page.clock.setFixedTime(new Date(started + 660000));
  await page.evaluate(() => window.card.tick());
  await expect(page.locator(".cursor")).toBeVisible();
  await expect(page.locator(".status-label")).toHaveText("Ready to start");
});
test("padding controls emit minute values in the visual editor", async ({
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
  for (const [label, key, value] of [
    ["Padding before (minutes)", "padding_before", "2.5"],
    ["Padding after (minutes)", "padding_after", "7"],
  ]) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(value);
    await input.dispatchEvent("change");
    expect(await page.evaluate((key) => window.changed[key], key)).toBe(
      Number(value),
    );
  }
});

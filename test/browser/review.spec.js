import { test, expect } from "@playwright/test";
const phases = [
  { label: "One", duration: "00:01:00" },
  { label: "Two", duration: "00:01:00" },
];
async function mount(page, config) {
  await page.goto("/test/fixture.html");
  await page.evaluate(async (config) => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig(config);
    window.card.hass = { config: { time_zone: "UTC" } };
    document.querySelector("main").append(window.card);
  }, config);
}
test("cosmetic edits retain an in-memory manual start", async ({ page }) => {
  await mount(page, { mode: "manual", phases });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const start = await page.evaluate(() => window.card.startedAt);
  await page.evaluate(() =>
    window.card.setConfig({
      ...window.card.config,
      title: "Renamed",
      height: 170,
      phases: window.card.config.phases.map((p) => ({
        ...p,
        label: p.label + " renamed",
        color: "#112233",
      })),
    }),
  );
  expect(await page.evaluate(() => window.card.startedAt)).toBe(start);
  await expect(page.locator(".status")).toContainText("One renamed");
});
test("manual wall-clock boundaries retain the seconds offset of Start", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-01-01T12:00:37Z"));
  await mount(page, { mode: "manual", phases });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".boundary").last()).toContainText("12:02:37");
});
test("out-of-range persisted timestamps are discarded instead of crashing", async ({
  page,
}) => {
  await mount(page, { mode: "manual", session_id: "range", phases });
  await page.evaluate(() =>
    localStorage.setItem(
      "time-sequence-card:range",
      JSON.stringify({ startedAt: 1e20, signature: window.card.signature() }),
    ),
  );
  await mount(page, { mode: "manual", session_id: "range", phases });
  await expect(page.locator(".status")).toContainText("Ready");
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeEnabled();
});
test("editor materialises stable IDs before reordering mixed implicit/explicit IDs", async ({
  page,
}) => {
  await mount(page, { mode: "manual", phases });
  await page.evaluate(async () => {
    const editor = await customElements
      .get("time-sequence-card")
      .getConfigElement();
    editor.setConfig({
      mode: "manual",
      session_id: "reorder",
      phases: [
        { id: "phase-0", label: "A", duration: "00:01:00" },
        { label: "B", duration: "00:01:00" },
      ],
    });
    editor.addEventListener("config-changed", (e) => {
      window.changed = e.detail.config;
      window.card.setConfig(window.changed);
    });
    window.card.setConfig({ ...editor.config, session_id: "reorder" });
    window.card.startedAt = Date.now();
    window.card.saveSession();
    document.querySelector("main").replaceChildren(editor);
  });
  await page.getByRole("button", { name: "Move phase 1 down" }).click();
  expect(await page.evaluate(() => window.changed.phases[0].label)).toBe("B");
  expect(
    await page.evaluate(
      () => new Set(window.changed.phases.map((p) => p.id)).size,
    ),
  ).toBe(2);
  expect(await page.evaluate(() => window.changed.phases[1].id)).toBe(
    "phase-0",
  );
  expect(await page.evaluate(() => window.card.startedAt)).toBe(null);
});

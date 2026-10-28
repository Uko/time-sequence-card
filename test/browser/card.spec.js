import { test, expect } from "@playwright/test";
const phases = [
  { label: "Laptop setup", duration: "00:01:00", icon: "mdi:laptop" },
  { label: "Talk", duration: "00:10:00" },
  { label: "Questions", duration: "00:03:00" },
];
async function freezeClock(page, time) {
  const instant = new Date(time);
  await page.clock.install({ time: instant });
  await page.clock.pauseAt(new Date(instant.getTime() + 60000));
  await page.clock.setSystemTime(instant);
}
async function mount(page, config) {
  await page.goto("/test/fixture.html");
  await page.evaluate(async (config) => {
    await Promise.race([
      customElements.whenDefined("time-sequence-card"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Card did not register")), 2000),
      ),
    ]);
    const card = document.createElement("time-sequence-card");
    card.setConfig(config);
    card.hass = { config: { time_zone: "UTC" }, locale: { language: "en" } };
    document.querySelector("main").append(card);
  }, config);
}
test("manual sequence auto-advances fixed windows, survives a reload and resets", async ({
  page,
}) => {
  await freezeClock(page, "2026-01-01T12:00:00Z");
  await mount(page, {
    mode: "manual",
    title: "Presentation",
    session_id: "presentation-test",
    phases,
  });
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".status")).toContainText("Laptop setup");
  await expect(page.locator(".status")).toContainText("1:00");
  await page.clock.fastForward(61000);
  await expect(page.locator(".status")).toContainText("Talk");
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeDisabled();
  await mount(page, {
    mode: "manual",
    title: "Presentation",
    session_id: "presentation-test",
    phases,
  });
  await expect(page.locator(".status")).toContainText("Talk");
  await page.clock.fastForward(600000);
  await expect(page.locator(".status")).toContainText("Questions");
  await page.clock.fastForward(180000);
  await expect(page.locator(".status")).toContainText("Finished");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator(".status")).toContainText("Ready");
});
test("scheduled finish renders boundaries, escapes labels and updates without rebuilding controls", async ({
  page,
}) => {
  await freezeClock(page, "2026-01-01T08:12:00Z");
  await mount(page, {
    mode: "scheduled",
    title: "School",
    anchor: { at: "08:25", edge: "end" },
    phases: [
      { label: "<img src=x onerror=alert(1)>", duration: "00:10:00" },
      { label: "Travel", duration: "00:15:00" },
    ],
  });
  await expect(page.locator(".status")).toContainText("Travel");
  await expect(page.locator(".boundary").last()).toContainText("08:25");
  await expect(page.locator("time-sequence-card img")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(
    () =>
      (window.statusNode = document
        .querySelector("time-sequence-card")
        .shadowRoot.querySelector(".status-label")),
  );
  await page.clock.fastForward(60000);
  expect(
    await page.evaluate(
      () =>
        window.statusNode ===
        document
          .querySelector("time-sequence-card")
          .shadowRoot.querySelector(".status-label"),
    ),
  ).toBe(true);
  await expect(page.locator(".remaining")).toContainText("12:00");
});
test("narrow layout keeps short phases accessible through tap details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mount(page, { mode: "manual", phases });
  await page.locator(".band").first().click();
  await expect(page.locator(".detail-name")).toHaveText("Laptop setup");
  await page.getByRole("button", { name: "Close phase details" }).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: "test-results/narrow.png", fullPage: true });
});
test("disconnect stops its clock and reconnect catches up without moving windows", async ({
  page,
}) => {
  await freezeClock(page, "2026-01-01T12:00:00Z");
  await mount(page, { mode: "manual", phases });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const original = await page.evaluate(() => {
    window.card = document.querySelector("time-sequence-card");
    const start = window.card.startedAt;
    window.card.remove();
    return start;
  });
  expect(await page.evaluate(() => window.card.timer)).toBe(0);
  expect(await page.evaluate(() => window.card.layoutFrame)).toBe(0);
  await page.clock.fastForward(120000);
  await page.evaluate(() => document.querySelector("main").append(window.card));
  await expect(page.locator(".status")).toContainText("Talk");
  expect(await page.evaluate(() => window.card.startedAt)).toBe(original);
});
test("invalid stored data and denied storage do not prevent a local Start", async ({
  page,
}) => {
  await page.goto("/test/fixture.html");
  await page.evaluate(() =>
    localStorage.setItem("time-sequence-card:broken", "not json"),
  );
  await mount(page, { mode: "manual", session_id: "broken", phases });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".status")).toContainText("Laptop setup");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Denied");
    };
    Storage.prototype.removeItem = () => {
      throw new Error("Denied");
    };
  });
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".warning")).toContainText(
    "Session storage unavailable",
  );
  await expect(page.locator(".status")).toContainText("Laptop setup");
});
test("manual storage synchronises Start and Reset to a same-origin tab", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  const config = { mode: "manual", session_id: "shared", phases };
  await mount(page, config);
  await mount(other, config);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(other.locator(".status")).toContainText("Laptop setup");
  await other.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator(".status")).toContainText("Ready");
});
test("showcase renders scheduled and manual sequences at kiosk width", async ({
  page,
}) => {
  await freezeClock(page, "2026-01-01T08:05:00Z");
  await page.goto("/test/preview.html");
  await expect(page.locator("time-sequence-card")).toHaveCount(2);
  await page.evaluate(() => {
    const regular = document.querySelectorAll("time-sequence-card")[1];
    const compact = document.createElement("time-sequence-card");
    compact.setConfig({
      ...regular.config,
      title: "Minimalist routine",
      minimalist: true,
      height: 80,
    });
    compact.hass = regular.hass;
    document.querySelector("main").append(compact);
  });
  await page.clock.runFor(32);
  await expect(page.locator(".status").last()).toContainText("Get dressed");
  await page.screenshot({ path: "test-results/showcase.png", fullPage: true });
});
test("visual editor edits, reorders and previews derived boundaries without starting a session", async ({
  page,
}) => {
  await mount(page, { mode: "manual", phases });
  await page.evaluate(
    async (config) => {
      const editor = await customElements
        .get("time-sequence-card")
        .getConfigElement();
      editor.setConfig(config);
      editor.hass = { config: { time_zone: "UTC" } };
      editor.addEventListener(
        "config-changed",
        (e) => (window.changed = e.detail.config),
      );
      document.querySelector("main").replaceChildren(editor);
    },
    { mode: "scheduled", anchor: { at: "08:25", edge: "end" }, phases },
  );
  await expect(page.locator(".preview")).toContainText("08:25");
  await page.getByLabel("Phase 1 duration").fill("00:02:00");
  await page.getByLabel("Phase 1 duration").dispatchEvent("change");
  expect(await page.evaluate(() => window.changed.phases[0].duration)).toBe(
    "00:02:00",
  );
  await page.getByRole("button", { name: "Move phase 1 down" }).click();
  expect(await page.evaluate(() => window.changed.phases[0].label)).toBe(
    "Talk",
  );
  await page.getByRole("button", { name: "Add phase" }).click();
  expect(await page.evaluate(() => window.changed.phases.length)).toBe(4);
});

import { test, expect } from "@playwright/test";
async function mount(page) {
  await page.clock.install({ time: new Date("2026-01-01T11:54:57Z") });
  await page.clock.pauseAt(new Date("2026-01-01T11:54:58Z"));
  await page.goto("/test/fixture.html");
  await page.evaluate(async () => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig({
      mode: "scheduled",
      anchor: { at: "12:00", edge: "start" },
      hide_outside_window: true,
      padding_before: 5,
      padding_after: 5,
      phases: [
        { label: "Prepare", duration: "00:05:00" },
        { label: "Travel", duration: "00:05:00" },
      ],
    });
    window.card.hass = { config: { time_zone: "UTC" } };
    // Model the inspected HA hui-card contract: visibility events collapse its wrapper;
    // hidden children must opt in to staying connected to retain their own timer.
    window.wrapper = document.createElement("div");
    window.wrapper.id = "wrapper";
    window.dayAllowed = true;
    window.events = [];
    window.syncWrapper = () => {
      window.wrapper.hidden = window.card.hidden || !window.dayAllowed;
      window.wrapper.style.display = window.wrapper.hidden ? "none" : "";
      if (window.wrapper.hidden && !window.card.connectedWhileHidden)
        window.card.remove();
    };
    window.card.addEventListener("card-visibility-changed", (e) => {
      window.events.push(e.detail.value);
      window.syncWrapper();
      e.stopPropagation();
    });
    document.querySelector("main").append(window.wrapper);
    window.wrapper.append(window.card);
    window.syncWrapper();
    const sibling = document.createElement("div");
    sibling.id = "sibling";
    sibling.textContent = "Other dashboard card";
    document.querySelector("main").append(sibling);
  });
}
test("hidden scheduled card stays connected, wakes on its own clock and collapses its HA wrapper", async ({
  page,
}) => {
  await mount(page);
  await expect(page.locator("time-sequence-card")).toBeHidden();
  await expect(page.locator("#wrapper")).toBeHidden();
  expect(await page.evaluate(() => window.card.isConnected)).toBe(true);
  expect(await page.evaluate(() => window.card.getCardSize())).toBe(0);
  const wrapperHeight = await page
    .locator("#wrapper")
    .evaluate((e) => e.getBoundingClientRect().height);
  expect(wrapperHeight).toBe(0);
  await page.clock.runFor(2000);
  await expect(page.locator("time-sequence-card")).toBeVisible();
  await expect(page.locator("#wrapper")).toBeVisible();
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.events)).toEqual([true]);
  await page.evaluate(() => {
    window.dayAllowed = false;
    window.syncWrapper();
  });
  await expect(page.locator("#wrapper")).toBeHidden();
  await page.evaluate(() => {
    window.dayAllowed = true;
    window.syncWrapper();
  });
  await page.clock.setSystemTime(new Date("2026-01-01T12:14:59Z"));
  await page.clock.runFor(1000);
  await expect(page.locator("time-sequence-card")).toBeHidden();
  await page.clock.setSystemTime(new Date("2026-01-02T11:54:59Z"));
  await page.clock.runFor(1000);
  await expect(page.locator("time-sequence-card")).toBeVisible();
  expect(await page.evaluate(() => window.events)).toEqual([true, false, true]);
  await page.evaluate(() => window.card.remove());
  expect(await page.evaluate(() => window.card.timer)).toBe(0);
});
test("preview and opt-out remain visible; manual cards never auto-hide", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => (window.card.preview = true));
  await expect(page.locator("time-sequence-card")).toBeVisible();
  await page.evaluate(() => (window.card.preview = false));
  await expect(page.locator("time-sequence-card")).toBeHidden();
  await page.evaluate(() =>
    window.card.setConfig({
      ...window.card.config,
      hide_outside_window: false,
    }),
  );
  await expect(page.locator("time-sequence-card")).toBeVisible();
  await page.evaluate(() =>
    window.card.setConfig({
      ...window.card.config,
      mode: "manual",
      hide_outside_window: true,
    }),
  );
  await expect(page.locator("time-sequence-card")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.clock.setSystemTime(new Date("2026-01-01T14:00:00Z"));
  await page.clock.runFor(1000);
  await expect(page.locator("time-sequence-card")).toBeVisible();
});
test("independent visibility margins keep the card visible beyond the timeline", async ({ page }) => {
  await mount(page);
  await page.evaluate(() => window.card.setConfig({ ...window.card.config,
    visibility_before: 15, visibility_after: 10 }));
  await expect(page.locator("time-sequence-card")).toBeVisible();
  await expect(page.locator(".now-label")).toBeHidden();
  await page.clock.setSystemTime(new Date("2026-01-01T12:19:59Z"));
  await page.clock.runFor(1000);
  await expect(page.locator("time-sequence-card")).toBeHidden();
});
test("wake from suspension refreshes visibility, hiding closes details and resolution errors stay visible", async ({
  page,
}) => {
  await mount(page);
  await page.clock.setSystemTime(new Date("2026-01-01T12:02:00Z"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.locator("time-sequence-card")).toBeVisible();
  await page.locator(".band").nth(1).click();
  await expect(page.locator(".phase-detail")).toBeVisible();
  await page.clock.setSystemTime(new Date("2026-01-01T12:15:00Z"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.locator("time-sequence-card")).toBeHidden();
  expect(
    await page.evaluate(() => window.card.hasAttribute("details-open")),
  ).toBe(false);
  await page.evaluate(
    () => (window.card.hass = { config: { time_zone: "Invalid/Zone" } }),
  );
  await expect(page.locator("time-sequence-card")).toBeVisible();
  await expect(page.locator(".warning")).toHaveText(
    "Unable to resolve time zone or scheduled time.",
  );
});
test("editor exposes the opt-in scheduled visibility checkbox", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(async () => {
    window.editor = await customElements
      .get("time-sequence-card")
      .getConfigElement();
    window.editor.setConfig({
      ...window.card.config,
      hide_outside_window: false,
    });
    window.editor.addEventListener(
      "config-changed",
      (e) => (window.changed = e.detail.config),
    );
    document.querySelector("main").replaceChildren(window.editor);
  });
  const input = page.getByLabel("Hide outside scheduled window", {
    exact: true,
  });
  await expect(input).not.toBeChecked();
  await input.check();
  expect(await page.evaluate(() => window.changed.hide_outside_window)).toBe(
    true,
  );
  for (const [label, key, value] of [["Visibility before (minutes)", "visibility_before", "15"], ["Visibility after (minutes)", "visibility_after", "10"]]) {
    const field = page.getByLabel(label);
    await field.fill(value);
    await field.dispatchEvent("change");
    expect(await page.evaluate((key) => window.changed[key], key)).toBe(Number(value));
    await field.fill("");
    await field.dispatchEvent("change");
    expect(await page.evaluate((key) => key in window.changed, key)).toBe(false);
  }
});

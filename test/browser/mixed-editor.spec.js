import { test, expect } from "@playwright/test";
async function mount(page) {
  await page.setViewportSize({ width: 1000, height: 2200 });
  await page.goto("/test/fixture.html");
  await page.evaluate(async () => {
    await customElements.whenDefined("time-sequence-card");
    window.editor = await customElements
      .get("time-sequence-card")
      .getConfigElement();
    window.editor.setConfig({
      mode: "manual",
      phases: [
        { id: "a", label: "Setup", duration: "00:01:00" },
        { id: "x", sound: "/one.wav" },
        { id: "b", label: "Talk", duration: "00:02:00" },
        { id: "y", sound: "/two.wav" },
      ],
    });
    window.editor.addEventListener(
      "config-changed",
      (e) => (window.changed = e.detail.config),
    );
    document.querySelector("main").append(window.editor);
  });
}
test("mouse handle dragging reorders mixed rows and emits a non-blocking adjacent-sounds warning", async ({
  page,
}) => {
  await mount(page);
  await expect(page.locator(".sequence-entry")).toHaveCount(4);
  await expect(page.locator(".sequence-warning")).toBeHidden();
  const from = await page.locator(".drag-handle").nth(1).boundingBox(),
    to = await page.locator(".sequence-entry").nth(3).boundingBox();
  await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(to.x + 30, to.y + to.height - 5, { steps: 15 });
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.changed.phases.map((p) => p.id)),
  ).toEqual(["a", "b", "y", "x"]);
  await expect(page.locator(".sequence-warning")).toContainText(
    "Adjacent sounds",
  );
  await expect(page.locator(".error")).toHaveText("");
  await page.locator(".drag-handle").nth(3).focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  expect(
    await page.evaluate(() => window.changed.phases.map((p) => p.id)),
  ).toEqual(["a", "x", "b", "y"]);
  await expect(page.locator(".sequence-warning")).toBeHidden();
});
test("touch handles reorder rows without relying on desktop drag-and-drop", async ({
  page,
}) => {
  await mount(page);
  await page.setViewportSize({ width: 360, height: 2200 });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  await page
    .locator(".sequence-entry")
    .nth(1)
    .evaluate((e) => e.scrollIntoView({ block: "start" }));
  const from = await page.locator(".drag-handle").nth(1).boundingBox(),
    to = await page.locator(".sequence-entry").nth(3).boundingBox();
  const start = { x: from.x + 10, y: from.y + 10 };
  const end = { x: to.x + 30, y: to.y + to.height - 5 };
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start],
  });
  for (let i = 1; i <= 12; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: start.x + ((end.x - start.x) * i) / 12,
          y: start.y + ((end.y - start.y) * i) / 12,
        },
      ],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    await page.evaluate(() => window.changed.phases.map((p) => p.id)),
  ).toEqual(["a", "b", "y", "x"]);
  await expect(page.locator(".sequence-warning")).toBeVisible();
  await session.detach();
});
test("sound rows can be added/removed, legacy end sounds migrate and last timed phase cannot be removed", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() =>
    window.editor.setConfig({
      mode: "manual",
      phases: [{ label: "Setup", duration: "00:01:00", sound: "/legacy.wav" }],
    }),
  );
  await expect(page.getByLabel("Sound 1 file", { exact: true })).toHaveValue(
    "/legacy.wav",
  );
  await expect(
    page.getByRole("button", { name: "Remove phase 1", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Add sound", exact: true }).click();
  await page.getByLabel("Sound 2 file", { exact: true }).fill("/new.wav");
  await page
    .getByLabel("Sound 2 file", { exact: true })
    .dispatchEvent("change");
  await expect(page.locator(".sequence-warning")).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.changed.phases.map((p) => p.sound ?? p.label),
    ),
  ).toEqual(["Setup", "/legacy.wav", "/new.wav"]);
  await page
    .getByRole("button", { name: "Remove sound 2", exact: true })
    .click();
  await expect(page.locator(".sequence-warning")).toBeHidden();
  await page.screenshot({
    path: "test-results/mixed-sequence-editor.png",
    fullPage: true,
  });
});

test("Escape and an outside drop cancel without changing configuration", async ({
  page,
}) => {
  await mount(page);
  const from = await page.locator(".drag-handle").nth(1).boundingBox(),
    to = await page.locator(".sequence-entry").nth(3).boundingBox();
  for (const cancel of ["escape", "outside"]) {
    await page.mouse.move(from.x + 10, from.y + 10);
    await page.mouse.down();
    await page.mouse.move(to.x + 30, to.y + to.height - 5, { steps: 10 });
    if (cancel === "escape") await page.keyboard.press("Escape");
    else await page.mouse.move(5, 5);
    await page.mouse.up();
    expect(await page.evaluate(() => window.changed)).toBeUndefined();
    await expect(
      page.locator(".dragging,.drop-before,.drop-after"),
    ).toHaveCount(0);
  }
});
test("dragging auto-scrolls a nested editor across a shadow-root boundary", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => {
    const scroller = document.createElement("div");
    scroller.id = "scroll-box";
    scroller.style.cssText = "height:260px;overflow:auto";
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" }).append(window.editor);
    scroller.append(host);
    document.querySelector("main").replaceChildren(scroller);
    const handle = window.editor.shadowRoot.querySelectorAll(".drag-handle")[1];
    scroller.scrollTop =
      handle.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      50;
  });
  const from = await page.locator(".drag-handle").nth(1).boundingBox(),
    box = await page.locator("#scroll-box").boundingBox();
  await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + box.height - 10, { steps: 10 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editor.shadowRoot
            .querySelectorAll(".sequence-entry")[3]
            .getBoundingClientRect().bottom <
          document.querySelector("#scroll-box").getBoundingClientRect().bottom -
            45,
      ),
    )
    .toBe(true);
  await page.mouse.move(box.x + 80, box.y + box.height / 2);
  // Pointer moves can be coalesced: wait until the editor has observed leaving
  // the scroll edge before measuring the final drop target.
  await expect
    .poll(() => page.evaluate(() => window.editor.drag?.y))
    .toBe(box.y + box.height / 2);
  const to = await page.locator(".sequence-entry").nth(3).boundingBox();
  await page.mouse.move(to.x + 30, to.y + to.height * 0.75);
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.changed.phases.map((p) => p.id)),
  ).toEqual(["a", "b", "y", "x"]);
});

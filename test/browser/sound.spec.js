import { test, expect } from "@playwright/test";
function tone() {
  const rate = 8000,
    frames = 800,
    b = Buffer.alloc(44 + frames * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    b.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 880) / rate) * 2000),
      44 + i * 2,
    );
  return b;
}
async function mount(page, extra = {}, at = "2026-01-01T12:00:00Z") {
  await page.clock.install({ time: new Date(Date.parse(at) - 1000) });
  await page.clock.pauseAt(new Date(at));
  await page.route("**/test-tone.wav", (r) =>
    r.fulfill({ contentType: "audio/wav", body: tone() }),
  );
  await page.addInitScript(() => {
    window.playCalls = 0;
    window.playStarted = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.playCalls++;
      const result = play.call(this);
      result.then(
        () => window.playStarted++,
        () => {},
      );
      return result;
    };
  });
  await page.goto("/test/fixture.html");
  await page.evaluate(async (extra) => {
    await customElements.whenDefined("time-sequence-card");
    window.card = document.createElement("time-sequence-card");
    window.card.setConfig({
      mode: "manual",
      phases: [
        { label: "Prepare", duration: "00:00:02", sound: "/test-tone.wav" },
        { label: "Finish", duration: "00:00:02" },
      ],
      ...extra,
    });
    window.card.hass = { config: { time_zone: "UTC" } };
    document.querySelector("main").append(window.card);
  }, extra);
}
test("real HTML audio plays at the configured end, once, without retiming manual sessions", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const started = await page.evaluate(() => window.card.startedAt);
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.playCalls)).toBe(0);
  await page.clock.runFor(1000);
  await expect.poll(() => page.evaluate(() => window.playStarted)).toBe(1);
  await page.evaluate(() => {
    window.card.tick();
    window.card.hass = { config: { time_zone: "UTC" } };
    window.card.setConfig({ ...window.card.config, title: "Changed" });
  });
  expect(await page.evaluate(() => window.card.startedAt)).toBe(started);
  expect(await page.evaluate(() => window.playCalls)).toBe(1);
  await page.clock.setSystemTime(new Date(started + 1000));
  await page.evaluate(() => window.card.tick());
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => window.playCalls)).toBe(1);
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => window.playCalls)).toBe(1);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.clock.runFor(2000);
  await expect.poll(() => page.evaluate(() => window.playStarted)).toBe(2);
});
test("final scheduled sound survives midnight rollover and automatic hiding", async ({
  page,
}) => {
  await mount(
    page,
    {
      mode: "scheduled",
      anchor: { at: "23:59", edge: "start" },
      hide_outside_window: true,
      phases: [
        { label: "Finish", duration: "00:01:00", sound: "/test-tone.wav" },
      ],
    },
    "2026-01-01T23:59:58Z",
  );
  await page.locator("h2").click();
  await page.clock.runFor(2000);
  await expect(page.locator("time-sequence-card")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.playStarted)).toBe(1);
  expect(await page.evaluate(() => window.playCalls)).toBe(1);
});
test("preview and externally hidden cards stay silent; blocked playback warns without repeated retries", async ({
  page,
}) => {
  await mount(page);
  await page.evaluate(() => (window.card.preview = true));
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.clock.runFor(2000);
  await page.evaluate(() => (window.card.preview = false));
  expect(await page.evaluate(() => window.playCalls)).toBe(0);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.evaluate(
    () => (document.querySelector("main").style.display = "none"),
  );
  await page.clock.runFor(2000);
  await page.evaluate(() => {
    document.querySelector("main").style.display = "";
    window.card.tick();
  });
  expect(await page.evaluate(() => window.playCalls)).toBe(0);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = function () {
      window.playCalls++;
      return Promise.reject(new DOMException("Blocked", "NotAllowedError"));
    };
  });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.clock.runFor(2000);
  await expect(page.locator(".warning")).toContainText("Sound could not play");
  await page.clock.runFor(1000);
  await page.evaluate(() => window.card.tick());
  expect(await page.evaluate(() => window.playCalls)).toBe(1);
});
test("initially elapsed events and suspension recovery do not emit old alarms; disconnect cleans up", async ({
  page,
}) => {
  await mount(page, {
    mode: "scheduled",
    anchor: { at: "11:00", edge: "start" },
  });
  expect(await page.evaluate(() => window.playCalls)).toBe(0);
  await page.evaluate(() =>
    window.card.setConfig({ ...window.card.config, mode: "manual" }),
  );
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.clock.setSystemTime(new Date("2026-01-01T12:10:00Z"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  expect(await page.evaluate(() => window.playCalls)).toBe(0);
  await page.evaluate(() => window.card.remove());
  expect(await page.evaluate(() => window.card.soundPlayer.audio)).toBeNull();
  expect(
    await page.evaluate(() => window.card.soundPlayer.previousNow),
  ).toBeNull();
});
test("editor configures optional sound paths per phase and clearing makes a phase silent", async ({
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
  const input = page.getByLabel("Phase 1 end sound", { exact: true });
  await expect(input).toHaveValue("/test-tone.wav");
  await input.fill("/local/sounds/example.mp3");
  await input.dispatchEvent("change");
  expect(await page.evaluate(() => window.changed.phases[0].sound)).toBe(
    "/local/sounds/example.mp3",
  );
  await input.fill("");
  await input.dispatchEvent("change");
  expect(
    await page.evaluate(() => window.changed.phases[0].sound),
  ).toBeUndefined();
});

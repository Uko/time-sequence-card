import { test, expect } from "@playwright/test";
const phases = [
  { sound: "/local/sounds/start.mp3" },
  { id: "setup", label: "Setup", duration: "00:01:00" },
  { sound: "/local/sounds/ready.mp3" },
  { sound: "/local/sounds/extra.mp3" },
  { id: "talk", label: "Talk", duration: "00:02:00" },
  { sound: "/local/sounds/end.mp3" },
];
async function mount(page, config) {
  await page.goto("/test/fixture.html");
  await page.clock.setFixedTime(new Date("2026-01-01T11:59:00Z"));
  await page.evaluate(async (config) => {
    await customElements.whenDefined("time-sequence-card");
    window.audioCalls = 0;
    window.Audio = class {
      constructor() {
        window.audioCalls++;
      }
    };
    window.editor = await customElements
      .get("time-sequence-card")
      .getConfigElement();
    window.editor.setConfig(config);
    document.querySelector("main").append(window.editor);
  }, config);
}
test("manual calculated preview includes every cue in playback order without playing audio", async ({
  page,
}) => {
  await mount(page, { mode: "manual", phases });
  await expect(page.locator(".preview")).toHaveText(
    "+0:00  Sound: /local/sounds/start.mp3\n+0:00 – +1:00  Setup\n+1:00  Sound: /local/sounds/ready.mp3\n+1:00  Sound: /local/sounds/extra.mp3\n+1:00 – +3:00  Talk\n+3:00  Sound: /local/sounds/end.mp3",
  );
  await page
    .getByRole("button", { name: "Move sound 1 down", exact: true })
    .click();
  await expect(page.locator(".preview")).toHaveText(
    "+0:00 – +1:00  Setup\n+1:00  Sound: /local/sounds/start.mp3\n+1:00  Sound: /local/sounds/ready.mp3\n+1:00  Sound: /local/sounds/extra.mp3\n+1:00 – +3:00  Talk\n+3:00  Sound: /local/sounds/end.mp3",
  );
  expect(await page.evaluate(() => window.audioCalls)).toBe(0);
});
test("scheduled finish preview timestamps sounds in the configured zone, ignoring padding", async ({
  page,
}) => {
  await mount(page, {
    mode: "scheduled",
    timezone: "Europe/Berlin",
    anchor: { at: "13:03", edge: "end" },
    padding_before: 5,
    padding_after: 5,
    phases,
  });
  await expect(page.locator(".preview")).toHaveText(
    "13:00:00  Sound: /local/sounds/start.mp3\n13:00:00 – 13:01:00  Setup\n13:01:00  Sound: /local/sounds/ready.mp3\n13:01:00  Sound: /local/sounds/extra.mp3\n13:01:00 – 13:03:00  Talk\n13:03:00  Sound: /local/sounds/end.mp3",
  );
  await page
    .locator(".preview")
    .screenshot({ path: "test-results/calculated-sounds.png" });
  expect(await page.evaluate(() => window.audioCalls)).toBe(0);
});
test("legacy phase-end sound is previewed after its phase and long paths wrap on narrow editors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  const sound = "/local/sounds/" + "long-file-name-".repeat(15) + ".mp3";
  await mount(page, {
    mode: "manual",
    phases: [{ label: "Setup", duration: "00:01:00", sound }],
  });
  await expect(page.locator(".preview")).toHaveText(
    "+0:00 – +1:00  Setup\n+1:00  Sound: " + sound,
  );
  expect(
    await page
      .locator(".preview")
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  expect(await page.evaluate(() => window.audioCalls)).toBe(0);
  await page
    .locator(".preview")
    .screenshot({ path: "test-results/calculated-sounds-narrow.png" });
});

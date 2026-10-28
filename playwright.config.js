import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1000, height: 800 },
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173/test/fixture.html",
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});

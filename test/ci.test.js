import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("CI runs one browser worker instead of scaling to host CPU count", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import config from './playwright.config.js'; console.log(JSON.stringify({workers:config.workers}));",
    ],
    {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, CI: "true" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).workers, 1);
});

test("Forgejo workflow explicitly enables bounded CI and omits ignored permission declarations", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/check.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /CI: ["']?true["']?/);
  assert.doesNotMatch(workflow, /^\s*permissions:/m);
  // Playwright 1.56 cannot install on Ubuntu 26.04 (currently ubuntu-latest).
  assert.match(workflow, /runs-on:.*'ubuntu-24\.04'.*'node24'/);
});

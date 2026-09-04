import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const winPs51Entrypoints = [
  "deploy/m3/install-dashboard-shortcut.ps1",
  "deploy/m3/start-dashboard.ps1",
  "M3_DEPLOY_DASHBOARD_V1.ps1",
  "RESTART_SHUISHU.cmd"
];

test("Windows PowerShell 5.1 entrypoints remain ASCII-safe", async () => {
  for (const relativePath of winPs51Entrypoints) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    const nonAscii = [...source].find((character) => character.codePointAt(0) > 0x7f);
    assert.equal(nonAscii, undefined, `${relativePath} contains non-ASCII source and may break on Windows PowerShell 5.1 without a UTF-8 BOM`);
  }
});

test("M-3 launcher detects and replaces a stale branded runtime", async () => {
  const launcher = await readFile(path.join(root, "deploy/m3/start-dashboard.ps1"), "utf8");
  assert.match(launcher, /Test-GatewaySurface/);
  assert.match(launcher, /dashboard\/cogiens-mark\.png/);
  assert.match(launcher, /approved Cogiens mark route is unavailable/);
  assert.match(launcher, /image\/png/);
  assert.match(launcher, /standard Cogiens header bootstrap/);
  assert.match(launcher, /running Gateway CSP does not allow/);
  assert.match(launcher, /APPROVED_LOGO/);
  assert.match(launcher, /Stop-GatewayListener/);
  assert.match(launcher, /ForceRestart/);
});

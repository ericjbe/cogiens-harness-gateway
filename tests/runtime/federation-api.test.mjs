import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("P2A-012 HTTP runtime exposes read-only registry, capability and passport views", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "chg-p2a-api-"));
  const child = spawn(process.execPath, [path.join(root, "apps", "gateway", "src", "server.mjs")], {
    cwd: root,
    env: { ...process.env, CHG_PORT: "0", CHG_DATA_ROOT: dataRoot },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    const port = await waitForPort(child);
    const base = `http://127.0.0.1:${port}`;
    const [registry, h01, h02Capabilities, passport] = await Promise.all([
      getJson(`${base}/v1/federation/registry`),
      getJson(`${base}/v1/federation/harnesses/H01`),
      getJson(`${base}/v1/federation/harnesses/H02/capabilities`),
      getJson(`${base}/v1/federation/harnesses/H01/passport`)
    ]);
    assert.equal(registry.runtime_implemented, true);
    assert.equal(registry.harnesses.length, 8);
    assert.equal(h01.support_status, "CONFORMANCE_PARTIAL");
    assert.equal(h02Capabilities.default_capability_state, "UNKNOWN");
    assert.equal(passport.status, "NOT_READY");

    const missing = await fetch(`${base}/v1/federation/harnesses/H99`);
    assert.equal(missing.status, 404);
  } finally {
    child.kill();
    await Promise.race([
      new Promise((resolve) => child.once("close", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
    await rm(dataRoot, { recursive: true, force: true });
  }
});

async function waitForPort(child) {
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Gateway startup timed out: ${stderr}`)), 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      const match = stdout.match(/listening on http:\/\/[^:]+:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Gateway exited before startup with code ${code}: ${stderr}`));
    });
  });
}

async function getJson(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200, `${url} must return 200`);
  return response.json();
}

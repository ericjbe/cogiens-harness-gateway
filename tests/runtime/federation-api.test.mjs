import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("P2A-012 HTTP runtime exposes federation views and Shuishu dashboard", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "chg-p2a-api-"));
  const child = spawn(process.execPath, [path.join(root, "apps", "gateway", "src", "server.mjs")], {
    cwd: root,
    env: { ...process.env, CHG_PORT: "0", CHG_DATA_ROOT: dataRoot, OLLAMA_BASE_URL: "http://127.0.0.1:1" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    const port = await waitForPort(child);
    const base = `http://127.0.0.1:${port}`;
    const [registry, h01, h02Capabilities, passport, summary] = await Promise.all([
      getJson(`${base}/v1/federation/registry`),
      getJson(`${base}/v1/federation/harnesses/H01`),
      getJson(`${base}/v1/federation/harnesses/H02/capabilities`),
      getJson(`${base}/v1/federation/harnesses/H01/passport`),
      getJson(`${base}/v1/dashboard/summary`)
    ]);
    assert.equal(registry.runtime_implemented, true);
    assert.equal(registry.harnesses.length, 8);
    assert.equal(h01.support_status, "CONFORMANCE_PARTIAL");
    assert.equal(h02Capabilities.default_capability_state, "UNKNOWN");
    assert.equal(passport.status, "NOT_READY");
    assert.equal(summary.schema_version, "chg.dashboard.summary.v0.1");
    assert.equal(summary.federation.harnesses.length, 8);
    assert.equal(summary.models.expected_count, 10);
    assert.equal(summary.models.models.length, 10);
    assert.ok(Array.isArray(summary.jobs));

    const dashboard = await fetch(`${base}/dashboard/`);
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.headers.get("content-type") ?? "", /text\/html/);
    const csp = dashboard.headers.get("content-security-policy") ?? "";
    assert.match(csp, /https:\/\/www\.cogiens\.com/);
    const html = await dashboard.text();
    assert.match(html, /水枢/);
    assert.match(html, /Cogiens Workforce OS/);
    assert.match(html, /https:\/\/www\.cogiens\.com\/brand\/js\/cogiens-header-bootstrap\.js/);
    assert.match(html, /data-product="水枢"/);
    assert.match(html, /data-product-suffix="Cogiens Workforce OS"/);

    // Owner-approved hierarchy: one top product name, no duplicate sidebar brand, then overview/KPIs.
    assert.match(html, /sidebar-spacer/);
    assert.doesNotMatch(html, /sidebar-logo/);
    assert.doesNotMatch(html, /sidebar-os-name/);
    assert.match(html, /WORKFORCE OVERVIEW/);
    assert.match(html, /<h1>概览<\/h1>/);
    assert.match(html, /metricHarnesses/);
    assert.match(html, /metricHealthy/);
    assert.match(html, /metricModels/);
    assert.match(html, /metricRunning/);
    assert.doesNotMatch(html, /metricSuccess/);
    assert.doesNotMatch(html, /metricGateway/);
    assert.match(html, /primary-grid/);
    assert.match(html, /执行引擎状态/);
    assert.match(html, /本地模型资源池/);

    const dashboardJs = await fetch(`${base}/dashboard/dashboard.js`);
    assert.equal(dashboardJs.status, 200);
    const dashboardSource = await dashboardJs.text();
    assert.match(dashboardSource, /shuishu-product-name/);
    assert.match(dashboardSource, /shuishu-os-label/);
    assert.match(dashboardSource, /shuishu-product-lockup/);
    assert.match(dashboardSource, /syncCogiensHeaderBrand/);
    assert.match(dashboardSource, /engineShortName/);

    const logo = await fetch(`${base}/dashboard/cogiens-mark.png`);
    assert.equal(logo.status, 200);
    assert.match(logo.headers.get("content-type") ?? "", /image\/png/);
    const logoBytes = new Uint8Array(await logo.arrayBuffer());
    assert.ok(logoBytes.length > 1000);
    assert.deepEqual([...logoBytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

    const icon = await fetch(`${base}/dashboard/shuishu.ico`);
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get("content-type") ?? "", /image\/x-icon/);

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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { createGatewayHandler } from "../../apps/gateway/src/app.mjs";
import { FleetRegistry } from "../../packages/gateway-core/src/fleet-registry.mjs";
import { MissionService } from "../../packages/gateway-core/src/mission-service.mjs";

test("fleet endpoint returns eight entries and dashboard renders API data", async (t) => {
  const token = "test-dashboard-token";
  const runtime = { health: async () => ({}), listAdapters: async () => [], getJob: () => null };
  const fleetRegistry = new FleetRegistry({ probeCommand: async () => ({ ok: false, reason: "executable_not_found", output: "" }) });
  const missionService = new MissionService({ runtime, fleetRegistry, defaultWorkspace: process.cwd() });
  const publicRoot = path.resolve("apps/gateway/public");
  const server = http.createServer(createGatewayHandler({ runtime, fleetRegistry, missionService, publicRoot, token }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const shellResponse = await fetch(base);
  assert.equal(shellResponse.status, 200);
  assert.match(await shellResponse.text(), /id="fleet"/);
  const scriptResponse = await fetch(`${base}/dashboard.js`);
  assert.equal(scriptResponse.status, 200);
  const browserScript = await scriptResponse.text();
  const styleResponse = await fetch(`${base}/dashboard.css`);
  assert.equal(styleResponse.status, 200);
  assert.equal((await fetch(`${base}/api/v1/fleet`)).status, 401);
  const fleetResponse = await fetch(`${base}/api/v1/fleet`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(fleetResponse.status, 200);
  assert.equal((await fleetResponse.json()).fleet.length, 8);
  const script = await readFile(path.join(publicRoot, "dashboard.js"), "utf8");
  assert.match(script, /fetcher\("\/api\/v1\/fleet", \{ headers: authHeaders\(\) \}\)/);
  assert.match(script, /fleet\.map/);
  assert.doesNotMatch(script, /OpenAI Codex|Anthropic Claude Code|Moonshot Kimi Code/);
  assert.equal(browserScript, script);
  assert.doesNotMatch(script, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
});

test("mission API creates and dispatches H01 through mocked runtime", async (t) => {
  const token = "test-dashboard-token";
  const runtime = {
    health: async () => ({}), listAdapters: async () => [],
    submitFanout: async () => ({ job_id: "job_api", runs: [{ run_id: "run_api", state: "QUEUED", events: [] }] }),
    getJob: () => ({ runs: [{ run_id: "run_api", state: "SUCCEEDED", events: [] }] })
  };
  const fleetRegistry = new FleetRegistry({ probeCommand: async () => ({ ok: false }) });
  const missionService = new MissionService({ runtime, fleetRegistry, defaultWorkspace: process.cwd() });
  const server = http.createServer(createGatewayHandler({ runtime, fleetRegistry, missionService, token, publicRoot: path.resolve("apps/gateway/public") }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
  const createdResponse = await fetch(`${base}/api/v1/missions`, { method: "POST", headers, body: JSON.stringify({ prompt: "API mission", fleet: ["H01"] }) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  const dispatchResponse = await fetch(`${base}/api/v1/missions/${created.mission_id}/dispatch`, { method: "POST", headers, body: "{}" });
  assert.equal(dispatchResponse.status, 202);
  const dispatched = await dispatchResponse.json();
  assert.equal(dispatched.job.runs[0].run_id, "run_api");
  assert.equal((await fetch(`${base}/api/v1/runs/run_api`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/api/v1/runs/run_api/events`, { headers })).status, 200);
});

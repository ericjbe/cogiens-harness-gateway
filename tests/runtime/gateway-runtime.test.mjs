import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MockHarnessAdapter } from "../../adapters/mock/src/index.mjs";
import { GatewayRuntime } from "../../packages/gateway-core/src/runtime.mjs";

test("gateway fans one job out to two harness adapters", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chg-gateway-"));
  const workspace = path.join(root, "workspace");
  const dataRoot = path.join(root, "data");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(workspace));
  const registry = ["cogiens.mock.a", "cogiens.mock.b"].map((id) => ({
    config: { id, kind: "mock", enabled: true },
    adapter: new MockHarnessAdapter()
  }));
  const runtime = await new GatewayRuntime({
    config: { server: { max_concurrency: 2, max_adapters_per_job: 4 } },
    registry,
    dataRoot
  }).initialize();
  try {
    const submitted = await runtime.submitFanout({
      workspace,
      prompt: "Run both real lifecycle paths.",
      adapters: registry.map((record) => record.config.id),
      max_concurrency: 2
    });
    let job = submitted;
    for (let attempt = 0; attempt < 100 && job.gateway_status === "RUNNING"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      job = runtime.getJob(job.job_id);
    }
    assert.equal(job.gateway_status, "COMPLETED");
    assert.deepEqual(job.runs.map((run) => run.state), ["SUCCEEDED", "SUCCEEDED"]);
    assert.equal(job.prompt.text, undefined);
    assert.equal(job.prompt.sha256.length, 64);
  } finally { await rm(root, { recursive: true, force: true }); }
});

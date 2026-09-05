import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MockHarnessAdapter } from "../../adapters/mock/src/index.mjs";
import { GatewayRuntime } from "../../packages/gateway-core/src/runtime.mjs";

test("gateway fans one job out to two harness adapters and reloads it durably", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chg-gateway-"));
  const workspace = path.join(root, "workspace");
  const dataRoot = path.join(root, "data");
  await mkdir(workspace);
  const registry = ["cogiens.mock.a", "cogiens.mock.b"].map((id) => ({
    config: { id, kind: "mock", enabled: true },
    adapter: new MockHarnessAdapter()
  }));
  const config = { server: { max_concurrency: 2, max_adapters_per_job: 4 } };
  const runtime = await new GatewayRuntime({ config, registry, dataRoot }).initialize();
  try {
    const submitted = await runtime.submitFanout({
      workspace,
      task_title: "P1 task center lifecycle",
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
    assert.equal(job.task_title, "P1 task center lifecycle");
    assert.deepEqual(job.runs.map((run) => run.state), ["SUCCEEDED", "SUCCEEDED"]);
    assert.equal(job.prompt.text, undefined);
    assert.equal(job.prompt.sha256.length, 64);
    assert.equal(runtime.listJobs(10).length, 1);

    const reloaded = await new GatewayRuntime({ config, registry, dataRoot }).initialize();
    const restored = reloaded.getJob(job.job_id);
    assert.equal(restored.gateway_status, "COMPLETED");
    assert.equal(restored.task_title, "P1 task center lifecycle");
    assert.equal(reloaded.listJobs(10)[0].job_id, job.job_id);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("gateway marks interrupted persisted runs failed after restart", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "chg-gateway-recovery-"));
  const dataRoot = path.join(root, "data");
  const jobsRoot = path.join(dataRoot, "jobs");
  await mkdir(jobsRoot, { recursive: true });
  const now = new Date().toISOString();
  const stale = {
    schema_version: "chg.gateway.job.v0.2",
    job_id: "job_recovery_test",
    trace_id: "trc_recovery_test",
    project_id: "recovery",
    task_title: "Interrupted task",
    prompt: { sha256: "0".repeat(64), length: 10 },
    status: "running",
    gateway_status: "RUNNING",
    requested_adapters: ["cogiens.mock.a"],
    workspace: root,
    created_at: now,
    updated_at: now,
    runs: [{
      schema_version: "chg.gateway.run.v0.2",
      run_id: "run_recovery_test",
      job_id: "job_recovery_test",
      trace_id: "trc_recovery_test",
      adapter_id: "cogiens.mock.a",
      state: "RUNNING",
      created_at: now,
      updated_at: now,
      events: [],
      artifacts: [],
      error: null
    }]
  };
  await writeFile(path.join(jobsRoot, `${stale.job_id}.json`), `${JSON.stringify(stale, null, 2)}\n`);

  try {
    const runtime = await new GatewayRuntime({ config: { server: {} }, registry: [], dataRoot }).initialize();
    const restored = runtime.getJob(stale.job_id);
    assert.equal(restored.gateway_status, "FAILED");
    assert.equal(restored.recovered_after_restart, true);
    assert.equal(restored.runs[0].state, "FAILED");
    assert.equal(restored.runs[0].error.code, "GATEWAY_RESTARTED");
  } finally { await rm(root, { recursive: true, force: true }); }
});

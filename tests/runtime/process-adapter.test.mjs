import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { OneShotProcessAdapter } from "../../adapters/process/src/one-shot-process-adapter.mjs";
import { collectEvents, requireEvent } from "../../packages/conformance-kit/src/index.mjs";

const fixture = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/one-shot-fixture.mjs");
let counter = 0;

function adapter() {
  return new OneShotProcessAdapter({
    adapterId: "cogiens.fixture.process",
    command: process.execPath,
    versionArgs: ["--version"],
    buildInvocation: () => ({ args: [fixture] }),
    parseOutput: ({ stdout, stderr, code }) => code === 0
      ? { success: true, finalText: stdout, finishReason: "completed" }
      : { success: false, error: { code: "HARNESS_CRASHED", message: stderr.trim() } }
  });
}

async function session(instance, workspace, policy = {}) {
  counter += 1;
  const uri = pathToFileURL(workspace).href;
  return instance.createSession({}, {
    job_id: `job_process_${counter}`,
    run_id: `run_process_${counter}`,
    trace_id: `trc_process_${counter}`,
    project_id: "CGS-HG-001",
    workspace: { uri, write_roots: [uri] },
    credentials: [],
    policy: { max_runtime_seconds: 5, max_output_bytes: 64 * 1024, ...policy }
  });
}

test("process adapter executes a real child and captures an artifact", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "chg-process-"));
  const instance = adapter();
  try {
    assert.equal((await instance.health()).status, "healthy");
    const handle = await session(instance, workspace);
    const events = await collectEvents(instance.startRun({}, handle, { prompt: { text: "hello" } }));
    assert.equal(requireEvent(events, "assistant.message.completed").payload.message, "fixture:hello");
    requireEvent(events, "run.succeeded");
    assert.equal((await collectEvents(instance.collectArtifacts({}, handle))).length, 1);
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test("process adapter enforces timeout and confirms cancellation", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "chg-process-"));
  try {
    const timed = adapter();
    const timedHandle = await session(timed, workspace, { max_runtime_seconds: 1 });
    const timedEvents = await collectEvents(timed.startRun({}, timedHandle, { prompt: { text: "hold" } }));
    requireEvent(timedEvents, "run.timed_out");

    const cancelled = adapter();
    const cancelledHandle = await session(cancelled, workspace);
    const iterator = cancelled.startRun({}, cancelledHandle, { prompt: { text: "hold" } })[Symbol.asyncIterator]();
    assert.equal((await iterator.next()).value.type, "run.started");
    const remainder = collectEvents(iterator);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await cancelled.cancel({}, cancelledHandle, { reason: "test" });
    assert.equal(result.confirmed, true);
    requireEvent(await remainder, "run.cancelled");
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test("process adapter fails closed on output overflow", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "chg-process-"));
  const instance = adapter();
  try {
    const handle = await session(instance, workspace, { max_output_bytes: 1024 });
    const events = await collectEvents(instance.startRun({}, handle, { prompt: { text: "overflow" } }));
    assert.equal(requireEvent(events, "run.failed").payload.error.code, "POLICY_DENIED");
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

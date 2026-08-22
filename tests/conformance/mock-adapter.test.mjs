import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { MockHarnessAdapter, getMockDescriptor } from "../../adapters/mock/src/index.mjs";
import {
  AdapterError,
  requireCapability,
  sha256Text,
  validateDescriptor
} from "../../packages/adapter-sdk/src/index.mjs";
import {
  assertArtifactIntegrity,
  assertMonotonicEvents,
  assertSecretAbsent,
  assertSingleTerminalEvent,
  collectEvents,
  requireEvent
} from "../../packages/conformance-kit/src/index.mjs";

const context = Object.freeze({ actor: "conformance-test" });
let counter = 0;

async function createFixture(adapter, suffix = "normal") {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "chg-p0-"));
  const workspaceUri = pathToFileURL(workspacePath).href;
  counter += 1;
  const request = {
    contract_version: "chg.adapter.v0.1",
    job_id: `job_${suffix}_${counter}`,
    run_id: `run_${suffix}_${counter}`,
    trace_id: `trc_${suffix}_${counter}`,
    project_id: "CGS-HG-001",
    workspace: {
      uri: workspaceUri,
      mode: "isolated-worktree",
      read_only_roots: [],
      write_roots: [workspaceUri]
    },
    identity: {
      tenant_id: "tenant_test",
      user_id: "user_test",
      actor_type: "human"
    },
    credentials: [],
    policy: {
      network: "restricted",
      approval_mode: "on-request",
      max_runtime_seconds: 30,
      max_output_bytes: 1048576
    }
  };
  const session = await adapter.createSession(context, request);
  return {
    request,
    session,
    workspacePath,
    cleanup: () => rm(workspacePath, { recursive: true, force: true })
  };
}

test("CT-001 descriptor and health are explicit", async () => {
  const adapter = new MockHarnessAdapter();
  const descriptor = validateDescriptor(await adapter.describe(context));
  assert.equal(descriptor.adapter_id, "cogiens.mock.memory");
  assert.equal(descriptor.status, "experimental");
  assert.equal((await adapter.health(context)).status, "healthy");
});

test("CT-002 normal lifecycle produces one terminal event and a valid artifact", async () => {
  const adapter = new MockHarnessAdapter();
  const fixture = await createFixture(adapter, "success");
  try {
    const events = await collectEvents(adapter.startRun(context, fixture.session, {
      prompt: { text: "Complete the P0 mock task." }
    }));
    assertMonotonicEvents(events);
    assertSingleTerminalEvent(events, "run.succeeded");
    requireEvent(events, "assistant.message.completed");
    const artifact = requireEvent(events, "artifact.created").payload.artifact;
    assertArtifactIntegrity(artifact);
    const collected = await collectEvents(adapter.collectArtifacts(context, fixture.session));
    assert.equal(collected.length, 1);
    assert.equal(collected[0].sha256, artifact.sha256);
    assert.equal((await adapter.close(context, fixture.session)).closed, true);
  } finally {
    await fixture.cleanup();
  }
});

test("CT-003 approval remains fail-closed until an explicit approval", async () => {
  const adapter = new MockHarnessAdapter();
  const fixture = await createFixture(adapter, "approval");
  try {
    const iterator = adapter.startRun(context, fixture.session, {
      prompt: { text: "[approval] Perform a consequential mock action." }
    })[Symbol.asyncIterator]();
    const events = [];
    events.push((await iterator.next()).value);
    const approvalEvent = (await iterator.next()).value;
    events.push(approvalEvent);
    events.push((await iterator.next()).value);
    assert.equal(events.at(-1).type, "run.waiting_approval");
    await adapter.decideApproval(context, fixture.session, {
      approval_id: approvalEvent.payload.approval.approval_id,
      decision: "approve",
      decided_by: "user_test"
    });
    events.push(...await collectEvents(iterator));
    assertMonotonicEvents(events);
    requireEvent(events, "approval.decided");
    assertSingleTerminalEvent(events, "run.succeeded");
  } finally {
    await fixture.cleanup();
  }
});

test("CT-004 denial prevents the consequential mock action", async () => {
  const adapter = new MockHarnessAdapter();
  const fixture = await createFixture(adapter, "denial");
  try {
    const iterator = adapter.startRun(context, fixture.session, {
      prompt: { text: "[approval] Do not continue without approval." }
    })[Symbol.asyncIterator]();
    const events = [];
    events.push((await iterator.next()).value);
    const approvalEvent = (await iterator.next()).value;
    events.push(approvalEvent);
    events.push((await iterator.next()).value);
    await adapter.decideApproval(context, fixture.session, {
      approval_id: approvalEvent.payload.approval.approval_id,
      decision: "deny",
      decided_by: "user_test"
    });
    events.push(...await collectEvents(iterator));
    assertMonotonicEvents(events);
    assertSingleTerminalEvent(events, "run.failed");
    assert.equal(requireEvent(events, "run.failed").payload.error.code, "APPROVAL_DENIED");
    assert.equal((await collectEvents(adapter.collectArtifacts(context, fixture.session))).length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("CT-005 cancellation is confirmed and terminal", async () => {
  const adapter = new MockHarnessAdapter();
  const fixture = await createFixture(adapter, "cancel");
  try {
    const iterator = adapter.startRun(context, fixture.session, {
      prompt: { text: "[hold] Wait until the control plane cancels." }
    })[Symbol.asyncIterator]();
    const events = [];
    events.push((await iterator.next()).value);
    events.push((await iterator.next()).value);
    const result = await adapter.cancel(context, fixture.session, { reason: "conformance" });
    assert.deepEqual(result, { cancelled: true, confirmed: true, already_terminal: false });
    events.push(...await collectEvents(iterator));
    assertMonotonicEvents(events);
    requireEvent(events, "run.cancel_requested");
    assertSingleTerminalEvent(events, "run.cancelled");
  } finally {
    await fixture.cleanup();
  }
});

test("CT-006 a write root outside the workspace is rejected", async () => {
  const adapter = new MockHarnessAdapter();
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), "chg-root-"));
  const outsidePath = await mkdtemp(path.join(os.tmpdir(), "chg-outside-"));
  try {
    await assert.rejects(
      () => adapter.createSession(context, {
        job_id: "job_escape",
        run_id: "run_escape",
        trace_id: "trc_escape",
        project_id: "CGS-HG-001",
        workspace: {
          uri: pathToFileURL(workspacePath).href,
          write_roots: [pathToFileURL(outsidePath).href]
        },
        credentials: []
      }),
      (error) => error instanceof AdapterError && error.code === "WORKSPACE_INVALID"
    );
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
    await rm(outsidePath, { recursive: true, force: true });
  }
});

test("CT-007 secret-like prompt material is not reflected into events", async () => {
  const adapter = new MockHarnessAdapter();
  const fixture = await createFixture(adapter, "redaction");
  const secret = ["sk", "p0", "NeverExpose", "12345678901234567890"].join("-");
  try {
    const events = await collectEvents(adapter.startRun(context, fixture.session, {
      prompt: { text: `Do not echo this value: ${secret}` }
    }));
    assertSecretAbsent(events, secret);
  } finally {
    await fixture.cleanup();
  }
});

test("CT-008 unsupported capability fails explicitly", () => {
  const descriptor = getMockDescriptor();
  assert.throws(
    () => requireCapability(descriptor, "session_fork"),
    (error) => error instanceof AdapterError && error.code === "CAPABILITY_UNSUPPORTED"
  );
});

test("CT-009 session creation is idempotent by run ID and resume preserves identity", async () => {
  const adapter = new MockHarnessAdapter();
  const fixture = await createFixture(adapter, "idempotent");
  try {
    const duplicate = await adapter.createSession(context, fixture.request);
    assert.equal(duplicate.native_session_id, fixture.session.native_session_id);
    const resumed = await adapter.resume(context, { native_session_id: fixture.session.native_session_id });
    assert.equal(resumed.run_id, fixture.session.run_id);
  } finally {
    await fixture.cleanup();
  }
});

test("CT-010 SHA-256 primitive matches Node crypto output", () => {
  assert.equal(
    sha256Text("cogiens-harness-gateway"),
    "4d9da451a96b549aa0c81cdb46ca17cdd934e725f297ab986030283ce8117229"
  );
});

import { randomUUID } from "node:crypto";
import {
  AdapterError,
  CONTRACT_VERSION,
  createDeferred,
  createEventFactory,
  createTextArtifact,
  requireCapability,
  validateCreateSessionRequest,
  validateDescriptor
} from "../../../packages/adapter-sdk/src/index.mjs";

const DESCRIPTOR = Object.freeze({
  contract_version: CONTRACT_VERSION,
  adapter_id: "cogiens.mock.memory",
  adapter_version: "0.1.0",
  harness_version: "mock-0.1.0",
  transport: ["in-memory"],
  capabilities: {
    streaming: true,
    approvals: true,
    cancel: true,
    resume: true,
    steer: true,
    session_fork: false,
    structured_output: true,
    file_diff: false,
    artifacts: true,
    usage: true,
    mcp: false,
    acp: false,
    remote_execution: false
  },
  experimental_capabilities: [],
  auth_modes: ["none"],
  platforms: ["linux", "windows", "macos"],
  status: "experimental"
});

export class MockHarnessAdapter {
  #sessionsByRun = new Map();
  #sessionsByNativeId = new Map();

  async describe() {
    return structuredClone(DESCRIPTOR);
  }

  async health() {
    return {
      status: "healthy",
      adapter_id: DESCRIPTOR.adapter_id,
      checked_at: new Date().toISOString(),
      details: { mode: "in-memory", production_ready: false }
    };
  }

  async createSession(_context, request) {
    validateCreateSessionRequest(request);
    const existing = this.#sessionsByRun.get(request.run_id);
    if (existing) return existing.handle;

    const nativeSessionId = `mock_${randomUUID().replaceAll("-", "")}`;
    const state = {
      request: structuredClone(request),
      nativeSessionId,
      runStarted: false,
      terminal: null,
      closed: false,
      artifacts: [],
      pendingApproval: null,
      cancelDeferred: createDeferred(),
      cancelRequested: false,
      steering: []
    };
    state.handle = Object.freeze({
      adapter_id: DESCRIPTOR.adapter_id,
      native_session_id: nativeSessionId,
      job_id: request.job_id,
      run_id: request.run_id,
      trace_id: request.trace_id
    });
    this.#sessionsByRun.set(request.run_id, state);
    this.#sessionsByNativeId.set(nativeSessionId, state);
    return state.handle;
  }

  startRun(_context, session, request) {
    const state = this.#getState(session);
    if (state.closed) throw new AdapterError("POLICY_DENIED", "Session is closed");
    if (state.runStarted) throw new AdapterError("PROTOCOL_MISMATCH", "Run already started");
    if (!request?.prompt?.text) throw new AdapterError("PROTOCOL_MISMATCH", "Prompt text is required");
    state.runStarted = true;
    return this.#run(state, request);
  }

  async *#run(state, request) {
    const emit = createEventFactory({
      trace_id: state.handle.trace_id,
      job_id: state.handle.job_id,
      run_id: state.handle.run_id,
      adapter_id: state.handle.adapter_id,
      native_session_id: state.handle.native_session_id
    });
    yield emit("run.started", { mode: "mock" });

    if (request.prompt.text.includes("[approval]")) {
      const approvalId = `apr_${randomUUID().replaceAll("-", "")}`;
      const decisionDeferred = createDeferred();
      state.pendingApproval = { approvalId, decisionDeferred, status: "pending" };
      const approval = {
        schema_version: "chg.approval.v0.1",
        approval_id: approvalId,
        run_id: state.handle.run_id,
        category: "shell_command",
        summary: "Mock consequential command",
        risk: "high",
        requested_scope: "one-shot",
        status: "pending",
        details: { command: "mock-command", cwd: state.request.workspace.uri },
        requested_at: new Date().toISOString(),
        decided_at: null,
        decided_by: null
      };
      yield emit("approval.requested", { approval });
      yield emit("run.waiting_approval", { approval_id: approvalId });

      const outcome = await Promise.race([
        decisionDeferred.promise.then((decision) => ({ kind: "decision", decision })),
        state.cancelDeferred.promise.then(() => ({ kind: "cancel" }))
      ]);

      if (outcome.kind === "cancel") {
        yield emit("run.cancel_requested", { reason: "cancelled while waiting for approval" }, "warning");
        yield emit("run.cancelled", { confirmed: true });
        state.terminal = "run.cancelled";
        return;
      }

      const { decision } = outcome;
      yield emit("approval.decided", {
        approval_id: approvalId,
        decision: decision.decision,
        decided_by: decision.decided_by
      });
      state.pendingApproval.status = decision.decision === "approve" ? "approved" : "denied";
      if (decision.decision !== "approve") {
        yield emit("run.failed", {
          error: { code: "APPROVAL_DENIED", message: "Mock approval was denied" }
        }, "error");
        state.terminal = "run.failed";
        return;
      }
    }

    if (request.prompt.text.includes("[hold]")) {
      yield emit("run.progress", { phase: "waiting-for-cancel" });
      await state.cancelDeferred.promise;
      yield emit("run.cancel_requested", { reason: "test cancellation" }, "warning");
      yield emit("run.cancelled", { confirmed: true });
      state.terminal = "run.cancelled";
      return;
    }

    if (state.cancelRequested) {
      yield emit("run.cancel_requested", { reason: "cancelled before completion" }, "warning");
      yield emit("run.cancelled", { confirmed: true });
      state.terminal = "run.cancelled";
      return;
    }

    yield emit("assistant.message.completed", { message: "Mock run completed." });
    const artifact = createTextArtifact(state.handle, {
      kind: "structured-output",
      media_type: "application/json",
      content: JSON.stringify({
        adapter_id: state.handle.adapter_id,
        run_id: state.handle.run_id,
        result: "mock-success"
      })
    });
    state.artifacts.push(artifact);
    yield emit("artifact.created", { artifact });
    yield emit("usage.updated", { input_tokens: 0, output_tokens: 0, estimated_cost: 0 });
    yield emit("run.succeeded", { result: "mock-success", evidence_required: true });
    state.terminal = "run.succeeded";
  }

  async decideApproval(_context, session, decision) {
    const state = this.#getState(session);
    requireCapability(DESCRIPTOR, "approvals");
    if (!state.pendingApproval || state.pendingApproval.approvalId !== decision.approval_id) {
      throw new AdapterError("APPROVAL_REQUIRED", "No matching approval is pending");
    }
    if (state.pendingApproval.status !== "pending") {
      throw new AdapterError("PROTOCOL_MISMATCH", "Approval has already been decided");
    }
    if (!new Set(["approve", "deny"]).has(decision.decision)) {
      throw new AdapterError("PROTOCOL_MISMATCH", "Decision must be approve or deny");
    }
    state.pendingApproval.decisionDeferred.resolve({
      decision: decision.decision,
      decided_by: decision.decided_by ?? "unknown"
    });
    return { accepted: true, command: "decideApproval" };
  }

  async steer(_context, session, request) {
    const state = this.#getState(session);
    requireCapability(DESCRIPTOR, "steer");
    if (state.terminal) throw new AdapterError("POLICY_DENIED", "Cannot steer a terminal run");
    if (!request?.text) throw new AdapterError("PROTOCOL_MISMATCH", "Steer text is required");
    state.steering.push(request.text);
    return { accepted: true, command: "steer" };
  }

  async cancel(_context, session, request = {}) {
    const state = this.#getState(session);
    requireCapability(DESCRIPTOR, "cancel");
    if (state.terminal) {
      return { cancelled: false, confirmed: true, already_terminal: true, terminal: state.terminal };
    }
    state.cancelRequested = true;
    state.cancelDeferred.resolve({ reason: request.reason ?? "user" });
    return { cancelled: true, confirmed: true, already_terminal: false };
  }

  async resume(_context, request) {
    requireCapability(DESCRIPTOR, "resume");
    const state = this.#sessionsByNativeId.get(request?.native_session_id);
    if (!state || state.closed) throw new AdapterError("HARNESS_NOT_FOUND", "Native session is unavailable");
    return state.handle;
  }

  async *collectArtifacts(_context, session) {
    const state = this.#getState(session);
    requireCapability(DESCRIPTOR, "artifacts");
    for (const artifact of state.artifacts) yield structuredClone(artifact);
  }

  async close(context, session) {
    const state = this.#getState(session);
    if (!state.terminal && state.runStarted) await this.cancel(context, session, { reason: "session-close" });
    state.closed = true;
    return { closed: true, native_session_id: state.nativeSessionId };
  }

  #getState(session) {
    const nativeSessionId = session?.native_session_id;
    const state = this.#sessionsByNativeId.get(nativeSessionId);
    if (!state) throw new AdapterError("HARNESS_NOT_FOUND", "Unknown mock session");
    return state;
  }
}

export function getMockDescriptor() {
  return validateDescriptor(structuredClone(DESCRIPTOR));
}

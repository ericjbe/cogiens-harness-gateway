import { randomUUID } from "node:crypto";

import {
  AdapterError,
  CONTRACT_VERSION,
  createEventFactory,
  createTextArtifact,
  validateCreateSessionRequest,
  validateDescriptor
} from "../../../packages/adapter-sdk/src/index.mjs";

export function createOllamaLocalAdapter(config = {}) {
  return new OllamaLocalAdapter(config);
}

export class OllamaLocalAdapter {
  #sessionsByRun = new Map();
  #sessionsByNativeId = new Map();

  constructor(config = {}) {
    if (!config.id) throw new TypeError("Local execution adapter requires id");
    if (!config.model) throw new TypeError("Local execution adapter requires model");

    this.config = {
      id: config.id,
      model: config.model,
      resourceId: config.resource_id ?? "M--",
      baseUrl: String(config.base_url ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, ""),
      timeoutMs: Math.max(1_000, Number(config.request_timeout_ms ?? 1_800_000)),
      system: typeof config.system === "string" ? config.system : ""
    };

    this.descriptor = validateDescriptor({
      contract_version: CONTRACT_VERSION,
      adapter_id: this.config.id,
      adapter_version: "0.1.0",
      harness_version: "cogiens-local-execution-v0.1",
      transport: ["local-http"],
      capabilities: {
        streaming: false,
        approvals: false,
        cancel: true,
        resume: false,
        steer: false,
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
      status: "candidate"
    });
  }

  async describe() {
    return structuredClone(this.descriptor);
  }

  async health() {
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3_000)
      });
      if (!response.ok) {
        return this.#healthFailure(checkedAt, "local_resource_http_error", { http_status: response.status });
      }
      const payload = await response.json();
      const models = Array.isArray(payload.models) ? payload.models : [];
      const installed = models.some((entry) => tagMatches(this.config.model, entry.name ?? entry.model ?? ""));
      if (!installed) {
        return this.#healthFailure(checkedAt, "local_resource_missing", { resource_id: this.config.resourceId });
      }
      return {
        status: "healthy",
        adapter_id: this.descriptor.adapter_id,
        checked_at: checkedAt,
        details: {
          resource_id: this.config.resourceId,
          execution_mode: "local",
          data_path: "device-local"
        }
      };
    } catch (error) {
      return this.#healthFailure(checkedAt, "local_resource_unreachable", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async createSession(_context, request) {
    validateCreateSessionRequest(request);
    const existing = this.#sessionsByRun.get(request.run_id);
    if (existing) return existing.handle;

    const nativeSessionId = `${this.descriptor.adapter_id.replaceAll(".", "_")}_${randomUUID().replaceAll("-", "")}`;
    const state = {
      request: structuredClone(request),
      controller: null,
      terminal: null,
      closed: false,
      artifacts: []
    };
    state.handle = Object.freeze({
      adapter_id: this.descriptor.adapter_id,
      native_session_id: nativeSessionId,
      job_id: request.job_id,
      run_id: request.run_id,
      trace_id: request.trace_id
    });
    this.#sessionsByRun.set(request.run_id, state);
    this.#sessionsByNativeId.set(nativeSessionId, state);
    return state.handle;
  }

  async *startRun(_context, session, request) {
    const state = this.#getState(session);
    if (state.closed) throw new AdapterError("POLICY_DENIED", "Session is closed");
    if (state.controller) throw new AdapterError("PROTOCOL_MISMATCH", "Run already started");
    if (!request?.prompt?.text) throw new AdapterError("PROTOCOL_MISMATCH", "Prompt text is required");

    const emit = createEventFactory({
      trace_id: state.handle.trace_id,
      job_id: state.handle.job_id,
      run_id: state.handle.run_id,
      adapter_id: state.handle.adapter_id,
      native_session_id: state.handle.native_session_id
    });

    state.controller = new AbortController();
    const policySeconds = Math.max(1, Number(state.request.policy?.max_runtime_seconds ?? 1800));
    const timeoutMs = Math.min(this.config.timeoutMs, policySeconds * 1000);
    const timeout = setTimeout(() => state.controller?.abort(new Error("local execution timed out")), timeoutMs);
    timeout.unref?.();

    yield emit("run.started", {
      execution_mode: "local",
      resource_id: this.config.resourceId
    });

    try {
      const body = {
        model: this.config.model,
        prompt: request.prompt.text,
        stream: false
      };
      if (this.config.system) body.system = this.config.system;

      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: state.controller.signal
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new AdapterError("HARNESS_CRASHED", `Local execution HTTP ${response.status}${detail ? `: ${tail(detail)}` : ""}`);
      }

      const payload = await response.json();
      const output = String(payload.response ?? "").trim();
      if (!output) throw new AdapterError("PROTOCOL_MISMATCH", "Local execution returned no result");

      yield emit("assistant.message.completed", { message: output });
      const artifact = createTextArtifact(state.handle, {
        kind: "structured-output",
        media_type: "text/markdown",
        content: output
      });
      state.artifacts.push(artifact);
      yield emit("artifact.created", { artifact });
      yield emit("usage.updated", {
        input_tokens: Number(payload.prompt_eval_count ?? 0),
        output_tokens: Number(payload.eval_count ?? 0),
        estimated_cost: 0,
        execution_mode: "local"
      });
      state.terminal = "run.succeeded";
      yield emit("run.succeeded", {
        result: "completed",
        resource_id: this.config.resourceId,
        execution_mode: "local"
      });
    } catch (error) {
      if (state.controller?.signal.aborted) {
        state.terminal = "run.cancelled";
        yield emit("run.cancelled", { confirmed: true }, "warning");
        return;
      }
      state.terminal = "run.failed";
      const stable = error instanceof AdapterError
        ? error.toJSON()
        : { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) };
      yield emit("run.failed", { error: stable }, "error");
    } finally {
      clearTimeout(timeout);
    }
  }

  async cancel(_context, session) {
    const state = this.#getState(session);
    if (state.terminal) return { cancelled: false, confirmed: true, already_terminal: true, terminal: state.terminal };
    if (!state.controller) return { cancelled: true, confirmed: false, already_terminal: false };
    state.controller.abort(new Error("cancelled"));
    return { cancelled: true, confirmed: true, already_terminal: false };
  }

  async *collectArtifacts(_context, session) {
    const state = this.#getState(session);
    for (const artifact of state.artifacts) yield structuredClone(artifact);
  }

  async decideApproval() {
    throw new AdapterError("CAPABILITY_UNSUPPORTED", "Local execution has no approval bridge");
  }

  async steer() {
    throw new AdapterError("CAPABILITY_UNSUPPORTED", "Local execution cannot steer an active one-shot run");
  }

  async resume() {
    throw new AdapterError("CAPABILITY_UNSUPPORTED", "Local execution does not resume one-shot sessions");
  }

  async close(_context, session) {
    const state = this.#getState(session);
    if (!state.terminal && state.controller) state.controller.abort(new Error("session-close"));
    state.closed = true;
    return { closed: true, native_session_id: state.handle.native_session_id };
  }

  #getState(session) {
    const state = this.#sessionsByNativeId.get(session?.native_session_id);
    if (!state) throw new AdapterError("HARNESS_NOT_FOUND", "Unknown local execution session");
    return state;
  }

  #healthFailure(checkedAt, reason, details = {}) {
    return {
      status: "unhealthy",
      adapter_id: this.descriptor.adapter_id,
      checked_at: checkedAt,
      details: { reason, resource_id: this.config.resourceId, ...details }
    };
  }
}

function tagMatches(expected, actual) {
  const left = String(expected ?? "").toLowerCase();
  const right = String(actual ?? "").toLowerCase();
  if (left === right) return true;
  if (!left.includes(":") && `${left}:latest` === right) return true;
  if (!right.includes(":") && `${right}:latest` === left) return true;
  return false;
}

function tail(value, length = 500) {
  const text = String(value ?? "");
  return text.length <= length ? text : text.slice(-length);
}

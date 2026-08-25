import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  AdapterError,
  CONTRACT_VERSION,
  createEventFactory,
  createTextArtifact,
  validateCreateSessionRequest,
  validateDescriptor
} from "../../../packages/adapter-sdk/src/index.mjs";

const PLATFORM = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";

export class OneShotProcessAdapter {
  #sessionsByRun = new Map();
  #sessionsByNativeId = new Map();

  constructor(options) {
    if (!options?.adapterId || !options?.command || typeof options.buildInvocation !== "function") {
      throw new TypeError("adapterId, command, and buildInvocation are required");
    }
    this.options = {
      adapterVersion: "0.2.0",
      harnessVersion: "unknown-until-health-check",
      versionArgs: ["--version"],
      authModes: ["provider-login", "api-key", "oauth"],
      requiredEnv: [],
      maxOutputBytes: 4 * 1024 * 1024,
      capabilities: {},
      ...options
    };
    this.descriptor = validateDescriptor({
      contract_version: CONTRACT_VERSION,
      adapter_id: this.options.adapterId,
      adapter_version: this.options.adapterVersion,
      harness_version: this.options.harnessVersion,
      transport: ["stdio-process"],
      capabilities: {
        streaming: false,
        approvals: false,
        cancel: true,
        resume: false,
        steer: false,
        session_fork: false,
        structured_output: false,
        file_diff: false,
        artifacts: true,
        usage: false,
        mcp: false,
        acp: false,
        remote_execution: false,
        ...this.options.capabilities
      },
      experimental_capabilities: [],
      auth_modes: this.options.authModes,
      platforms: this.options.platforms ?? ["linux", "windows", "macos"],
      status: "candidate"
    });
  }

  async describe() {
    return structuredClone(this.descriptor);
  }

  async health() {
    const checkedAt = new Date().toISOString();
    if (!this.descriptor.platforms.includes(PLATFORM)) {
      return {
        status: "unhealthy",
        adapter_id: this.descriptor.adapter_id,
        checked_at: checkedAt,
        details: { reason: "platform_unsupported", platform: PLATFORM, supported_platforms: this.descriptor.platforms }
      };
    }
    const missingEnv = this.options.requiredEnv.filter((name) => !process.env[name]);
    if (missingEnv.length > 0) {
      return {
        status: "unhealthy",
        adapter_id: this.descriptor.adapter_id,
        checked_at: checkedAt,
        details: { reason: "required_environment_missing", missing_env: missingEnv }
      };
    }
    const version = await probe(this.options.command, this.options.versionArgs, this.options.probeTimeoutMs ?? 10_000);
    if (!version.ok) {
      return {
        status: "unhealthy",
        adapter_id: this.descriptor.adapter_id,
        checked_at: checkedAt,
        details: { reason: version.reason, command: this.options.command }
      };
    }
    if (this.options.healthCheck) {
      const extra = await this.options.healthCheck();
      if (!extra.ok) {
        return {
          status: "unhealthy",
          adapter_id: this.descriptor.adapter_id,
          checked_at: checkedAt,
          details: { reason: extra.reason, version: version.output }
        };
      }
    }
    return {
      status: "healthy",
      adapter_id: this.descriptor.adapter_id,
      checked_at: checkedAt,
      details: {
        command: this.options.command,
        version: version.output,
        auth_probe: this.options.healthCheck ? "passed" : "not_available"
      }
    };
  }

  async createSession(_context, request) {
    validateCreateSessionRequest(request);
    const existing = this.#sessionsByRun.get(request.run_id);
    if (existing) return existing.handle;
    const nativeSessionId = `${this.descriptor.adapter_id.replaceAll(".", "_")}_${randomUUID().replaceAll("-", "")}`;
    const state = {
      request: structuredClone(request),
      nativeSessionId,
      child: null,
      exitPromise: null,
      terminal: null,
      cancelRequested: false,
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
    if (state.exitPromise) throw new AdapterError("PROTOCOL_MISMATCH", "Run already started");
    if (!request?.prompt?.text) throw new AdapterError("PROTOCOL_MISMATCH", "Prompt text is required");

    const emit = createEventFactory({
      trace_id: state.handle.trace_id,
      job_id: state.handle.job_id,
      run_id: state.handle.run_id,
      adapter_id: state.handle.adapter_id,
      native_session_id: state.handle.native_session_id
    });
    const cwd = fileURLToPath(state.request.workspace.uri);
    const invocation = this.options.buildInvocation({
      prompt: request.prompt.text,
      cwd,
      session: state.handle,
      policy: state.request.policy ?? {}
    });
    const timeoutMs = Math.max(1, Number(state.request.policy?.max_runtime_seconds ?? 1800)) * 1000;
    const maxOutputBytes = Math.max(1024, Number(state.request.policy?.max_output_bytes ?? this.options.maxOutputBytes));

    yield emit("run.started", {
      transport: "stdio-process",
      command: this.options.command,
      timeout_seconds: timeoutMs / 1000
    });

    state.exitPromise = runChild({
      command: this.options.command,
      args: invocation.args ?? [],
      stdin: invocation.stdin ?? request.prompt.text,
      cwd,
      env: invocation.env ?? {},
      blockedEnv: this.options.blockedEnv ?? [],
      timeoutMs,
      maxOutputBytes,
      onSpawn: (child) => { state.child = child; }
    });
    const outcome = await state.exitPromise;

    if (state.cancelRequested) {
      state.terminal = "run.cancelled";
      yield emit("run.cancelled", { confirmed: outcome.closed, exit_code: outcome.code }, "warning");
      return;
    }
    if (outcome.timedOut) {
      state.terminal = "run.timed_out";
      yield emit("run.timed_out", { error: { code: "RUN_TIMED_OUT", message: "Harness exceeded its run timeout" } }, "error");
      return;
    }
    if (outcome.outputExceeded) {
      state.terminal = "run.failed";
      yield emit("run.failed", { error: { code: "POLICY_DENIED", message: "Harness exceeded the output byte limit" } }, "error");
      return;
    }
    if (outcome.spawnError) {
      state.terminal = "run.failed";
      yield emit("run.failed", {
        error: { code: "ADAPTER_UNHEALTHY", message: outcome.spawnError.message }
      }, "error");
      return;
    }

    let parsed;
    try {
      parsed = await this.options.parseOutput({ stdout: outcome.stdout, stderr: outcome.stderr, code: outcome.code });
    } catch (cause) {
      state.terminal = "run.failed";
      yield emit("run.failed", {
        error: { code: "PROTOCOL_MISMATCH", message: cause instanceof Error ? cause.message : String(cause) },
        stderr_tail: tail(outcome.stderr)
      }, "error");
      return;
    }

    if (outcome.code !== 0 || parsed.success === false) {
      state.terminal = "run.failed";
      yield emit("run.failed", {
        error: {
          code: parsed.error?.code ?? "HARNESS_CRASHED",
          message: parsed.error?.message ?? `Harness exited with code ${outcome.code}`
        },
        stderr_tail: tail(outcome.stderr)
      }, "error");
      return;
    }

    const response = String(parsed.finalText ?? "");
    yield emit("assistant.message.completed", { message: response });
    const artifact = createTextArtifact(state.handle, {
      kind: "structured-output",
      media_type: parsed.mediaType ?? "text/plain",
      content: response
    });
    state.artifacts.push(artifact);
    yield emit("artifact.created", { artifact });
    if (parsed.usage) yield emit("usage.updated", parsed.usage);
    state.terminal = "run.succeeded";
    yield emit("run.succeeded", { result: "completed", finish_reason: parsed.finishReason ?? null });
  }

  async cancel(_context, session, request = {}) {
    const state = this.#getState(session);
    if (state.terminal) return { cancelled: false, confirmed: true, already_terminal: true, terminal: state.terminal };
    state.cancelRequested = true;
    if (!state.child) return { cancelled: true, confirmed: false, already_terminal: false, reason: request.reason ?? "user" };
    await terminateProcessTree(state.child);
    const confirmed = state.exitPromise ? Boolean((await state.exitPromise).closed) : false;
    return { cancelled: true, confirmed, already_terminal: false };
  }

  async decideApproval() {
    throw new AdapterError("CAPABILITY_UNSUPPORTED", `${this.descriptor.adapter_id} one-shot mode has no approval bridge`);
  }

  async steer() {
    throw new AdapterError("CAPABILITY_UNSUPPORTED", `${this.descriptor.adapter_id} one-shot mode cannot steer an active run`);
  }

  async resume() {
    throw new AdapterError("CAPABILITY_UNSUPPORTED", `${this.descriptor.adapter_id} one-shot mode cannot resume a native session`);
  }

  async *collectArtifacts(_context, session) {
    const state = this.#getState(session);
    for (const artifact of state.artifacts) yield structuredClone(artifact);
  }

  async close(context, session) {
    const state = this.#getState(session);
    if (!state.terminal && state.exitPromise) await this.cancel(context, session, { reason: "session-close" });
    state.closed = true;
    return { closed: true, native_session_id: state.nativeSessionId };
  }

  #getState(session) {
    const state = this.#sessionsByNativeId.get(session?.native_session_id);
    if (!state) throw new AdapterError("HARNESS_NOT_FOUND", "Unknown process-backed session");
    return state;
  }
}

export async function probe(command, args = ["--version"], timeoutMs = 10_000, options = {}) {
  const result = await runChild({ command, args, stdin: "", cwd: process.cwd(), env: {}, blockedEnv: options.blockedEnv ?? [], timeoutMs, maxOutputBytes: 64 * 1024 });
  if (result.spawnError) return { ok: false, reason: "executable_not_found", output: "" };
  if (result.timedOut) return { ok: false, reason: "health_check_timed_out", output: "" };
  if (result.code !== 0) return { ok: false, reason: "health_check_failed", output: tail(result.stderr || result.stdout) };
  return { ok: true, reason: null, output: tail(result.stdout || result.stderr).trim() };
}

export async function runChild({ command, args, stdin, cwd, env = {}, blockedEnv = [], timeoutMs, maxOutputBytes, onSpawn = () => {} }) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let settled = false;
    let timedOut = false;
    let outputExceeded = false;
    let spawnError = null;
    const childEnv = { ...process.env, ...env };
    for (const name of blockedEnv) delete childEnv[name];
    const child = spawn(command, args, {
      cwd,
      env: childEnv,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"]
    });
    onSpawn(child);
    const timer = setTimeout(() => {
      timedOut = true;
      void terminateProcessTree(child);
    }, timeoutMs);
    timer.unref?.();
    const collect = (target) => (chunk) => {
      const text = chunk.toString("utf8");
      bytes += Buffer.byteLength(text);
      if (bytes > maxOutputBytes) {
        outputExceeded = true;
        void terminateProcessTree(child);
        return;
      }
      if (target === "stdout") stdout += text;
      else stderr += text;
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    child.on("error", (error) => { spawnError = error; });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut, outputExceeded, spawnError, closed: true });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(String(stdin ?? ""));
  });
}

async function terminateProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" });
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        try { killer.kill(); } catch {}
        finish();
      }, 5_000);
      killer.on("error", finish);
      killer.on("close", finish);
    });
    if (child.exitCode === null) {
      try { child.kill("SIGKILL"); } catch {}
    }
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (child.exitCode === null) {
    try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
  }
}

function tail(value, length = 2000) {
  const text = String(value ?? "");
  return text.length <= length ? text : text.slice(-length);
}

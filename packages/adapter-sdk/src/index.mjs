import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRACT_VERSION = "chg.adapter.v0.1";
export const EVENT_SCHEMA_VERSION = "chg.event.v0.1";
export const ARTIFACT_SCHEMA_VERSION = "chg.artifact.v0.1";

export const TERMINAL_EVENT_TYPES = new Set([
  "run.succeeded",
  "run.failed",
  "run.cancelled",
  "run.timed_out"
]);

export class AdapterError extends Error {
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "AdapterError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.origin = options.origin ?? "adapter";
    this.nativeCode = options.nativeCode ?? null;
    this.details = options.details ?? {};
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      retry_after_ms: this.retryAfterMs,
      origin: this.origin,
      native_code: this.nativeCode,
      details: this.details
    };
  }
}

export function validateDescriptor(descriptor) {
  if (!descriptor || descriptor.contract_version !== CONTRACT_VERSION) {
    throw new AdapterError("PROTOCOL_MISMATCH", `Expected ${CONTRACT_VERSION}`);
  }
  for (const key of ["adapter_id", "adapter_version", "harness_version", "status"]) {
    if (typeof descriptor[key] !== "string" || descriptor[key].length === 0) {
      throw new AdapterError("PROTOCOL_MISMATCH", `Descriptor field ${key} is required`);
    }
  }
  if (!Array.isArray(descriptor.transport) || descriptor.transport.length === 0) {
    throw new AdapterError("PROTOCOL_MISMATCH", "Descriptor transport is required");
  }
  if (!descriptor.capabilities || typeof descriptor.capabilities !== "object") {
    throw new AdapterError("PROTOCOL_MISMATCH", "Descriptor capabilities are required");
  }
  for (const capability of ["streaming", "approvals", "cancel", "resume", "steer", "artifacts", "usage"]) {
    if (typeof descriptor.capabilities[capability] !== "boolean") {
      throw new AdapterError("PROTOCOL_MISMATCH", `Capability ${capability} must be boolean`);
    }
  }
  return descriptor;
}

export function requireCapability(descriptor, capability) {
  validateDescriptor(descriptor);
  if (descriptor.capabilities[capability] !== true) {
    throw new AdapterError(
      "CAPABILITY_UNSUPPORTED",
      `${descriptor.adapter_id} does not support ${capability}`,
      { details: { adapter_id: descriptor.adapter_id, capability } }
    );
  }
}

export function validateCreateSessionRequest(request) {
  if (!request || typeof request !== "object") {
    throw new AdapterError("PROTOCOL_MISMATCH", "Session request must be an object");
  }
  for (const key of ["job_id", "run_id", "trace_id", "project_id"]) {
    if (typeof request[key] !== "string" || request[key].length === 0) {
      throw new AdapterError("PROTOCOL_MISMATCH", `Session field ${key} is required`);
    }
  }
  if (!request.workspace || typeof request.workspace.uri !== "string") {
    throw new AdapterError("WORKSPACE_INVALID", "Workspace URI is required");
  }
  if (!request.workspace.uri.startsWith("file:")) {
    throw new AdapterError("WORKSPACE_INVALID", "P0 supports file: workspace URIs only");
  }
  const writeRoots = request.workspace.write_roots ?? [];
  if (!Array.isArray(writeRoots) || writeRoots.length === 0) {
    throw new AdapterError("WORKSPACE_INVALID", "At least one write root is required");
  }
  for (const writeRoot of writeRoots) {
    assertFileUriWithin(request.workspace.uri, writeRoot);
  }
  for (const credential of request.credentials ?? []) {
    const forbiddenKeys = ["value", "secret", "token", "api_key", "password"];
    for (const key of forbiddenKeys) {
      if (Object.hasOwn(credential, key)) {
        throw new AdapterError("POLICY_DENIED", `Credential plaintext field ${key} is forbidden`);
      }
    }
    if (typeof credential.credential_ref !== "string" || credential.credential_ref.length === 0) {
      throw new AdapterError("AUTH_REQUIRED", "credential_ref is required");
    }
  }
  return request;
}

export function assertFileUriWithin(rootUri, candidateUri) {
  let rootPath;
  let candidatePath;
  try {
    rootPath = path.resolve(fileURLToPath(rootUri));
    candidatePath = path.resolve(fileURLToPath(candidateUri));
  } catch (cause) {
    throw new AdapterError("WORKSPACE_INVALID", "Workspace roots must be valid file URIs", { cause });
  }
  const relative = path.relative(rootPath, candidatePath);
  const inside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (!inside) {
    throw new AdapterError("WORKSPACE_INVALID", "Write root escapes the workspace", {
      details: { root_uri: rootUri, candidate_uri: candidateUri }
    });
  }
  return candidateUri;
}

export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function createEventFactory(binding) {
  let sequence = 0;
  const required = ["trace_id", "job_id", "run_id", "adapter_id", "native_session_id"];
  for (const key of required) {
    if (typeof binding[key] !== "string" || binding[key].length === 0) {
      throw new AdapterError("PROTOCOL_MISMATCH", `Event binding ${key} is required`);
    }
  }
  return (type, payload = {}, severity = "info") => ({
    schema_version: EVENT_SCHEMA_VERSION,
    event_id: `evt_${randomUUID().replaceAll("-", "")}`,
    trace_id: binding.trace_id,
    job_id: binding.job_id,
    run_id: binding.run_id,
    adapter_id: binding.adapter_id,
    native_session_id: binding.native_session_id,
    sequence: ++sequence,
    occurred_at: new Date().toISOString(),
    type,
    severity,
    payload: redactSecrets(payload),
    raw_event_ref: null
  });
}

export function sha256Text(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function createTextArtifact(binding, options) {
  const content = String(options.content ?? "");
  return {
    schema_version: ARTIFACT_SCHEMA_VERSION,
    artifact_id: `art_${randomUUID().replaceAll("-", "")}`,
    trace_id: binding.trace_id,
    job_id: binding.job_id,
    run_id: binding.run_id,
    kind: options.kind ?? "structured-output",
    media_type: options.media_type ?? "application/json",
    size_bytes: Buffer.byteLength(content, "utf8"),
    sha256: sha256Text(content),
    uri: null,
    content: redactText(content),
    created_at: new Date().toISOString()
  };
}

export function redactSecrets(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        if (/^(?:secret|token|password|api[_-]?key)$/i.test(key)) return [key, "[REDACTED]"];
        return [key, redactSecrets(nested)];
      })
    );
  }
  return value;
}

function redactText(text) {
  return String(text)
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(/\bxai-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]")
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi, "Bearer [REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]");
}

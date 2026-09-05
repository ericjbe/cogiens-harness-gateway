import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { AdapterError, redactSecrets, sha256Text } from "../../adapter-sdk/src/index.mjs";

const TERMINAL_TO_STATE = {
  "run.succeeded": "SUCCEEDED",
  "run.failed": "FAILED",
  "run.cancelled": "CANCELLED",
  "run.timed_out": "TIMED_OUT"
};
const TERMINAL_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]);
const ACTIVE_STATES = new Set(["QUEUED", "STARTING", "RUNNING"]);

export class GatewayRuntime {
  constructor({ config, registry, dataRoot }) {
    this.config = config;
    this.registry = registry;
    this.dataRoot = path.resolve(dataRoot);
    this.jobs = new Map();
    this.activeRuns = new Map();
    this.persistQueues = new Map();
  }

  async initialize() {
    const jobsDirectory = path.join(this.dataRoot, "jobs");
    await mkdir(jobsDirectory, { recursive: true });
    await this.#loadPersistedJobs(jobsDirectory);
    return this;
  }

  async health() {
    const adapters = await this.listAdapters();
    return {
      status: adapters.some((item) => item.health.status === "healthy") ? "healthy" : "degraded",
      checked_at: new Date().toISOString(),
      adapters
    };
  }

  async listAdapters() {
    return Promise.all(this.registry.map(async (record) => {
      if (!record.adapter) {
        return {
          id: record.config.id,
          kind: record.config.kind,
          enabled: false,
          descriptor: null,
          health: { status: "disabled", adapter_id: record.config.id, checked_at: new Date().toISOString(), details: {} }
        };
      }
      const [descriptor, health] = await Promise.all([record.adapter.describe({}), record.adapter.health({})]);
      return { id: record.config.id, kind: record.config.kind, enabled: true, descriptor, health };
    }));
  }

  listJobs(limit = 50) {
    const safeLimit = Math.min(200, Math.max(1, Number.isInteger(limit) ? limit : 50));
    return [...this.jobs.values()]
      .sort((a, b) => Date.parse(b.updated_at ?? b.created_at ?? 0) - Date.parse(a.updated_at ?? a.created_at ?? 0))
      .slice(0, safeLimit)
      .map((job) => publicJob(job));
  }

  async submitFanout(input) {
    const normalized = await validateFanout(input, this.registry, this.config);
    const now = new Date().toISOString();
    const job = {
      schema_version: "chg.gateway.job.v0.2",
      job_id: makeId("job"),
      trace_id: makeId("trc"),
      tenant_id: input.tenant_id ?? "local",
      project_id: input.project_id ?? "local-project",
      task_title: normalizeTaskTitle(input.task_title, normalized.prompt),
      prompt: { sha256: sha256Text(normalized.prompt), length: normalized.prompt.length },
      status: "running",
      gateway_status: "RUNNING",
      requested_adapters: normalized.adapters,
      workspace: normalized.workspace,
      cancel_requested: false,
      created_at: now,
      updated_at: now,
      runs: normalized.adapters.map((adapterId) => ({
        schema_version: "chg.gateway.run.v0.2",
        run_id: makeId("run"),
        job_id: null,
        trace_id: null,
        adapter_id: adapterId,
        native_session_id: null,
        state: "QUEUED",
        business_acceptance: "PENDING",
        created_at: now,
        updated_at: now,
        events: [],
        artifacts: [],
        error: null
      }))
    };
    for (const run of job.runs) {
      run.job_id = job.job_id;
      run.trace_id = job.trace_id;
    }
    this.jobs.set(job.job_id, job);
    await this.#persist(job);
    void this.#execute(job, normalized).catch(async (error) => {
      const failure = {
        gateway_status: "FAILED",
        status: "rejected",
        error: stableError(error),
        updated_at: new Date().toISOString()
      };
      try {
        await this.#commitDurableState(job, failure);
      } catch (persistenceError) {
        Object.assign(job, failure, { persistence_error: stableError(persistenceError) });
      }
    });
    return publicJob(job);
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId);
    return job ? publicJob(job) : null;
  }

  async cancelJob(jobId, reason = "user") {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    job.cancel_requested = true;
    job.cancel_reason = String(reason || "user").slice(0, 200);
    job.updated_at = new Date().toISOString();

    for (const run of job.runs) {
      if (TERMINAL_STATES.has(run.state)) continue;
      const active = this.activeRuns.get(run.run_id);
      if (active) {
        try {
          await active.adapter.cancel({ actor: "gateway" }, active.session, { reason: job.cancel_reason });
        } catch (error) {
          run.cancel_error = stableError(error);
        }
      } else {
        run.state = "CANCELLED";
        run.updated_at = new Date().toISOString();
      }
    }
    await this.#persist(job);
    return publicJob(job);
  }

  async cancelRun(jobId, runId, reason = "user") {
    const job = this.jobs.get(jobId);
    const run = job?.runs.find((candidate) => candidate.run_id === runId);
    if (!job || !run) return null;
    const active = this.activeRuns.get(runId);
    if (!active) {
      return { cancelled: false, confirmed: TERMINAL_STATES.has(run.state) };
    }
    run.cancel_requested = true;
    run.updated_at = new Date().toISOString();
    const result = await active.adapter.cancel({ actor: "gateway" }, active.session, { reason });
    await this.#persist(job);
    return result;
  }

  async #execute(job, input) {
    await mapLimit(job.runs, input.maxConcurrency, (run) => this.#executeRun(job, run, input));
    const succeeded = job.runs.filter((run) => run.state === "SUCCEEDED").length;
    const cancelled = job.runs.filter((run) => run.state === "CANCELLED").length;
    const all = job.runs.length;
    let gatewayStatus;
    let status;
    if (succeeded === all) {
      gatewayStatus = "COMPLETED";
      status = "needs_review";
    } else if (succeeded > 0) {
      gatewayStatus = "PARTIAL";
      status = "needs_review";
    } else if (cancelled > 0 && job.cancel_requested) {
      gatewayStatus = "CANCELLED";
      status = "cancelled";
    } else {
      gatewayStatus = "FAILED";
      status = "rejected";
    }
    await this.#commitDurableState(job, {
      gateway_status: gatewayStatus,
      status,
      updated_at: new Date().toISOString()
    });
  }

  async #executeRun(job, run, input) {
    if (job.cancel_requested) {
      run.state = "CANCELLED";
      run.updated_at = new Date().toISOString();
      await this.#persist(job);
      return;
    }

    const record = this.registry.find((candidate) => candidate.config.id === run.adapter_id);
    if (!record?.adapter) {
      return this.#failRun(job, run, new AdapterError("ADAPTER_UNHEALTHY", `${run.adapter_id} is disabled`));
    }
    const health = await record.adapter.health({ actor: "gateway" });
    if (health.status !== "healthy") {
      return this.#failRun(job, run, new AdapterError("ADAPTER_UNHEALTHY", `${run.adapter_id} failed preflight`, { details: health.details }));
    }

    run.state = "STARTING";
    run.updated_at = new Date().toISOString();
    await this.#persist(job);
    let session;
    try {
      const workspaceUri = pathToFileURL(input.workspace).href;
      session = await record.adapter.createSession({ actor: "gateway" }, {
        contract_version: "chg.adapter.v0.1",
        job_id: job.job_id,
        run_id: run.run_id,
        trace_id: job.trace_id,
        project_id: job.project_id,
        workspace: {
          uri: workspaceUri,
          mode: "local-bounded-workspace",
          read_only_roots: [],
          write_roots: [workspaceUri]
        },
        identity: { tenant_id: job.tenant_id, user_id: "local-user", actor_type: "human" },
        credentials: [],
        policy: {
          network: input.network,
          approval_mode: "never",
          max_runtime_seconds: input.timeoutSeconds,
          max_output_bytes: input.maxOutputBytes
        }
      });
      run.native_session_id = session.native_session_id;
      run.state = "RUNNING";
      run.updated_at = new Date().toISOString();
      this.activeRuns.set(run.run_id, { adapter: record.adapter, session });
      await this.#persist(job);

      for await (const event of record.adapter.startRun({ actor: "gateway" }, session, { prompt: { text: input.prompt } })) {
        run.events.push(event);
        if (TERMINAL_TO_STATE[event.type]) run.state = TERMINAL_TO_STATE[event.type];
        run.updated_at = new Date().toISOString();
        await this.#persist(job);
      }
      for await (const artifact of record.adapter.collectArtifacts({ actor: "gateway" }, session)) {
        if (!run.artifacts.some((item) => item.artifact_id === artifact.artifact_id)) run.artifacts.push(artifact);
      }
      if (!TERMINAL_TO_STATE[run.events.at(-1)?.type] && run.state === "RUNNING") {
        throw new AdapterError("PROTOCOL_MISMATCH", "Adapter stream ended without a terminal event");
      }
    } catch (error) {
      await this.#failRun(job, run, error);
    } finally {
      this.activeRuns.delete(run.run_id);
      if (session) {
        try { await record.adapter.close({ actor: "gateway" }, session); } catch {}
      }
      run.updated_at = new Date().toISOString();
      await this.#persist(job);
    }
  }

  async #failRun(job, run, error) {
    run.state = "FAILED";
    run.error = stableError(error);
    run.updated_at = new Date().toISOString();
    await this.#persist(job);
  }

  async #loadPersistedJobs(jobsDirectory) {
    const entries = await readdir(jobsDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const job = JSON.parse(await readFile(path.join(jobsDirectory, entry.name), "utf8"));
        if (!job?.job_id || !Array.isArray(job.runs)) continue;
        let recovered = false;
        const now = new Date().toISOString();
        for (const run of job.runs) {
          if (!ACTIVE_STATES.has(run.state)) continue;
          run.state = "FAILED";
          run.error = {
            code: "GATEWAY_RESTARTED",
            message: "Gateway restarted before this run reached a terminal state",
            retryable: true,
            origin: "gateway"
          };
          run.updated_at = now;
          recovered = true;
        }
        if (job.gateway_status === "RUNNING" || recovered) {
          job.gateway_status = "FAILED";
          job.status = "rejected";
          job.recovered_after_restart = true;
          job.updated_at = now;
          recovered = true;
        }
        this.jobs.set(job.job_id, job);
        if (recovered) await this.#persist(job);
      } catch {
        // Ignore malformed historical snapshots; they remain on disk for manual inspection.
      }
    }
  }

  async #commitDurableState(job, fields) {
    const durableSnapshot = Object.assign(structuredClone(job), fields);
    await this.#persist(durableSnapshot);
    Object.assign(job, fields);
  }

  async #persist(job) {
    const target = path.join(this.dataRoot, "jobs", `${job.job_id}.json`);
    const snapshot = `${JSON.stringify(publicJob(job), null, 2)}\n`;
    const previous = this.persistQueues.get(job.job_id) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, snapshot, { mode: 0o600 });
      await rename(temporary, target);
    });
    this.persistQueues.set(job.job_id, operation);
    try {
      await operation;
    } finally {
      if (this.persistQueues.get(job.job_id) === operation) this.persistQueues.delete(job.job_id);
    }
  }
}

async function validateFanout(input, registry, config) {
  if (!input || typeof input !== "object") throw new AdapterError("PROTOCOL_MISMATCH", "JSON body is required");
  if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new AdapterError("PROTOCOL_MISMATCH", "prompt is required");
  if (Object.hasOwn(input, "credentials") || Object.hasOwn(input, "api_key") || Object.hasOwn(input, "token")) {
    throw new AdapterError("POLICY_DENIED", "Credentials are not accepted in job bodies; use harness-native login or environment references");
  }
  if (typeof input.workspace !== "string" || !path.isAbsolute(input.workspace)) {
    throw new AdapterError("WORKSPACE_INVALID", "workspace must be an absolute local path");
  }
  const info = await stat(input.workspace).catch(() => null);
  if (!info?.isDirectory()) throw new AdapterError("WORKSPACE_INVALID", "workspace must exist and be a directory");
  const configured = new Set(registry.map((record) => record.config.id));
  const defaults = registry.filter((record) => record.config.enabled === true).map((record) => record.config.id);
  const adapters = input.adapters ?? defaults;
  if (!Array.isArray(adapters) || adapters.length === 0) throw new AdapterError("PROTOCOL_MISMATCH", "At least one adapter is required");
  if (adapters.length > (config.server?.max_adapters_per_job ?? 8)) throw new AdapterError("POLICY_DENIED", "Too many adapters requested");
  for (const adapterId of adapters) if (!configured.has(adapterId)) throw new AdapterError("PROTOCOL_MISMATCH", `Unknown adapter: ${adapterId}`);
  return {
    prompt: input.prompt,
    workspace: path.resolve(input.workspace),
    adapters: [...new Set(adapters)],
    timeoutSeconds: clampInteger(input.timeout_seconds, 1, config.server?.max_runtime_seconds ?? 3600, 1800),
    maxOutputBytes: clampInteger(input.max_output_bytes, 1024, config.server?.max_output_bytes ?? 4 * 1024 * 1024, 4 * 1024 * 1024),
    maxConcurrency: clampInteger(input.max_concurrency, 1, config.server?.max_concurrency ?? 4, config.server?.max_concurrency ?? 4),
    network: input.network === "live" ? "live" : "restricted"
  };
}

function normalizeTaskTitle(value, prompt) {
  const explicit = typeof value === "string" ? value.trim() : "";
  const firstLine = String(prompt ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "Untitled task";
  return (explicit || firstLine).slice(0, 120);
}

function publicJob(job) {
  return redactSecrets(structuredClone(job));
}

function stableError(error) {
  if (error instanceof AdapterError) return error.toJSON();
  return { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error), retryable: false, origin: "gateway" };
}

function makeId(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function clampInteger(value, min, max, fallback) {
  const number = Number.isInteger(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
}

async function mapLimit(items, limit, task) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await task(items[index]);
    }
  });
  await Promise.all(workers);
}

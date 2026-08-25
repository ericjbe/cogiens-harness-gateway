import { probe } from "../../../adapters/process/src/one-shot-process-adapter.mjs";

export const BILLING_MODES = Object.freeze([
  "SUBSCRIPTION_INCLUDED", "FIXED_CODING_PLAN", "ENTERPRISE_SEAT", "API_USAGE",
  "FREE_QUOTA", "LOCAL_COMPUTE", "UNKNOWN_REQUIRES_REVIEW"
]);

const DEFINITIONS = Object.freeze([
  fleet("H01", "OpenAI Codex", "OpenAI", "codex", "openai.codex.cli", {
    auth_mode: "LOCAL_CLI_SESSION", billing_mode: "SUBSCRIPTION_INCLUDED", subscription_reused: true,
    headless_mode: "codex exec --json (prompt over stdin)", capabilities: ["mission_dispatch", "artifacts", "cancellation", "structured_output"]
  }),
  fleet("H02", "Anthropic Claude Code", "Anthropic", "claude", null),
  fleet("H03", "xAI Grok", "xAI", "grok", null),
  fleet("H04", "Moonshot Kimi Code", "Moonshot AI", "kimi", null),
  fleet("H05", "DeepSeek Harness", "DeepSeek", "python", "deepseek.harness.python", { auth_mode: "API_KEY_ENV_REFERENCE", billing_mode: "API_USAGE", api_key_required: true }),
  fleet("H06", "Qwen Code", "Alibaba Cloud", "qwen", null),
  fleet("H07", "Google", "Google", "gemini", null),
  fleet("H08", "Mistral Vibe", "Mistral AI", "vibe", null)
]);

function fleet(harness_id, canonical_name, vendor, executable, adapter_id, overrides = {}) {
  return Object.freeze({
    harness_id, canonical_name, vendor, executable, adapter_id,
    auth_mode: "UNKNOWN_REQUIRES_REVIEW",
    billing_mode: "UNKNOWN_REQUIRES_REVIEW",
    subscription_reused: false,
    api_key_required: false,
    headless_mode: "NOT_YET_ADAPTED",
    transport: adapter_id ? "stdio-process" : "UNAVAILABLE",
    capabilities: [],
    ...overrides
  });
}

export class FleetRegistry {
  constructor({ gatewayRegistry = [], probeCommand = probe, cacheTtlMs = 30_000 } = {}) {
    this.gatewayRegistry = gatewayRegistry;
    this.probeCommand = probeCommand;
    this.cacheTtlMs = cacheTtlMs;
    this.cachedList = null;
    this.cachedAt = 0;
  }

  async list() {
    if (this.cachedList && Date.now() - this.cachedAt < this.cacheTtlMs) return structuredClone(await this.cachedList);
    this.cachedAt = Date.now();
    this.cachedList = Promise.all(DEFINITIONS.map((definition) => this.#inspect(definition)));
    try { return structuredClone(await this.cachedList); } catch (error) { this.cachedList = null; throw error; }
  }

  getDefinition(harnessId) {
    return DEFINITIONS.find((item) => item.harness_id === harnessId) ?? null;
  }

  adapterIdFor(harnessId) {
    return this.getDefinition(harnessId)?.adapter_id ?? null;
  }

  async #inspect(definition) {
    const checkedAt = new Date().toISOString();
    const record = definition.adapter_id
      ? this.gatewayRegistry.find((candidate) => candidate.config.id === definition.adapter_id)
      : null;
    let installed = false;
    let version = null;
    let authHealth = "NOT_CONFIGURED";
    let lastError = null;

    if (record?.adapter) {
      const [descriptor, health] = await Promise.all([record.adapter.describe({}), record.adapter.health({})]);
      installed = health.details?.reason !== "executable_not_found";
      version = health.details?.version ?? descriptor.harness_version ?? null;
      authHealth = health.status === "healthy" ? "AUTHENTICATED" : authState(health.details?.reason);
      lastError = health.status === "healthy" ? null : health.details?.reason ?? "adapter_unhealthy";
    } else {
      const result = await this.probeCommand(definition.executable, ["--version"], 3_000);
      installed = result.ok;
      version = result.ok ? result.output : null;
      authHealth = installed ? "UNVERIFIED" : "NOT_INSTALLED";
      lastError = result.ok ? null : result.reason;
    }

    return {
      harness_id: definition.harness_id,
      canonical_name: definition.canonical_name,
      vendor: definition.vendor,
      executable: definition.executable,
      installed,
      version,
      auth_mode: definition.auth_mode,
      auth_health: authHealth,
      billing_mode: definition.billing_mode,
      subscription_reused: definition.subscription_reused,
      api_key_required: definition.api_key_required,
      headless_mode: definition.headless_mode,
      transport: definition.transport,
      capabilities: [...definition.capabilities],
      current_account_if_safely_exposed: null,
      quota_if_exposed: null,
      last_verified_at: checkedAt,
      last_error: lastError
    };
  }
}

function authState(reason) {
  if (reason === "codex_not_authenticated") return "LOGIN_REQUIRED";
  if (reason === "executable_not_found") return "NOT_INSTALLED";
  return "UNHEALTHY";
}

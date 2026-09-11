import { readFile } from "node:fs/promises";
import path from "node:path";

import { createCodexCliAdapter } from "../../../adapters/codex-cli/src/index.mjs";
import { createDeepSeekPythonAdapter } from "../../../adapters/deepseek-python/src/index.mjs";
import { createHermesCliAdapter } from "../../../adapters/hermes-cli/src/index.mjs";
import { createOllamaLocalAdapter } from "../../../adapters/ollama-local/src/index.mjs";

const FACTORIES = new Map([
  ["codex-cli", createCodexCliAdapter],
  ["hermes-cli", createHermesCliAdapter],
  ["deepseek-python", createDeepSeekPythonAdapter],
  ["ollama-local", createOllamaLocalAdapter]
]);

export async function loadGatewayConfig(configPath) {
  const absolute = path.resolve(configPath);
  let config;
  try {
    config = JSON.parse(await readFile(absolute, "utf8"));
  } catch (cause) {
    throw new Error(`Cannot read gateway config ${absolute}: ${cause instanceof Error ? cause.message : cause}`);
  }
  if (!Array.isArray(config.adapters)) throw new Error("Gateway config requires an adapters array");
  const seen = new Set();
  for (const entry of config.adapters) {
    if (!entry?.id || !entry?.kind) throw new Error("Every adapter config requires id and kind");
    if (seen.has(entry.id)) throw new Error(`Duplicate adapter id: ${entry.id}`);
    seen.add(entry.id);
    if (!FACTORIES.has(entry.kind) && entry.kind !== "plugin-module") throw new Error(`Unsupported adapter kind: ${entry.kind}`);
  }
  if (config.model_harness !== undefined) {
    if (!config.model_harness || typeof config.model_harness !== "object" || Array.isArray(config.model_harness))
      throw new Error("model_harness must be an object");
    if (!Array.isArray(config.model_harness.slots)) throw new Error("model_harness.slots must be an array");
    const slotIds = new Set();
    for (const slot of config.model_harness.slots) {
      if (!slot || typeof slot !== "object" || Array.isArray(slot) || typeof slot.slot_id !== "string" || !slot.slot_id)
        throw new Error("Every model harness slot requires slot_id");
      if (slotIds.has(slot.slot_id)) throw new Error(`Duplicate model harness slot_id: ${slot.slot_id}`);
      slotIds.add(slot.slot_id);
      if (!['free', 'paid'].includes(slot.access_class)) throw new Error(`Invalid access_class for slot: ${slot.slot_id}`);
      if (!['operator-only', 'tenant-allowlist', 'all-tenants'].includes(slot.tenant_visibility))
        throw new Error(`Invalid tenant_visibility for slot: ${slot.slot_id}`);
      if (slot.adapter_id !== undefined && slot.adapter_id !== null && (typeof slot.adapter_id !== "string" || !slot.adapter_id))
        throw new Error(`Invalid adapter_id for slot: ${slot.slot_id}`);
    }
  }
  return { ...config, config_path: absolute };
}

export function createRegistry(config) {
  return config.adapters.map((entry) => ({
    config: structuredClone(entry),
    adapter: entry.enabled === true ? FACTORIES.get(entry.kind)(entry) : null
  }));
}

// Preserve the existing synchronous built-in factory for existing callers.
export async function createRegistryWithPlugins(config) {
  const { loadPluginAdapter } = await import("./plugin-loader.mjs");
  const records = [];
  for (const entry of config.adapters) {
    const adapter = entry.enabled !== true ? null : entry.kind === "plugin-module"
      ? await loadPluginAdapter(entry, config) : FACTORIES.get(entry.kind)(entry);
    records.push({ config: structuredClone(entry), adapter });
  }
  return records;
}

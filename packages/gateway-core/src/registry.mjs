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
    if (!FACTORIES.has(entry.kind)) throw new Error(`Unsupported adapter kind: ${entry.kind}`);
  }
  return { ...config, config_path: absolute };
}

export function createRegistry(config) {
  return config.adapters.map((entry) => ({
    config: structuredClone(entry),
    adapter: entry.enabled === true ? FACTORIES.get(entry.kind)(entry) : null
  }));
}

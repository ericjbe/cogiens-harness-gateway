import { copyFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRegistry, loadGatewayConfig } from "../packages/gateway-core/src/registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.resolve(process.env.CHG_CONFIG ?? path.join(root, "config", "harnesses.local.json"));
const example = path.join(root, "config", "harnesses.example.json");
try { await readFile(target); } catch { await copyFile(example, target); }

const config = await loadGatewayConfig(target);
const probeConfig = {
  ...config,
  adapters: config.adapters.map((entry) => ({ ...entry, enabled: true }))
};
const records = createRegistry(probeConfig);
const statuses = [];
for (const record of records) {
  const health = await record.adapter.health({ actor: "detector" });
  const original = config.adapters.find((entry) => entry.id === record.config.id);
  original.enabled = health.status === "healthy";
  statuses.push({ id: original.id, enabled: original.enabled, reason: health.details?.reason ?? "preflight_passed" });
}

const temporary = `${target}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(configWithoutRuntimeFields(config), null, 2)}\n`, { mode: 0o600 });
await rename(temporary, target);
for (const status of statuses) {
  process.stdout.write(`${status.enabled ? "ENABLED " : "DISABLED"} ${status.id} (${status.reason})\n`);
}
process.stdout.write(`Wrote ${target}\n`);

function configWithoutRuntimeFields(value) {
  const copy = structuredClone(value);
  delete copy.config_path;
  return copy;
}

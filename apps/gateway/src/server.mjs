import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGatewayHandler } from "./app.mjs";
import { FleetRegistry } from "../../../packages/gateway-core/src/fleet-registry.mjs";
import { MissionService } from "../../../packages/gateway-core/src/mission-service.mjs";
import { createRegistry, loadGatewayConfig } from "../../../packages/gateway-core/src/registry.mjs";
import { GatewayRuntime } from "../../../packages/gateway-core/src/runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const localConfig = path.join(ROOT, "config", "harnesses.local.json");
const configPath = process.env.CHG_CONFIG ?? (existsSync(localConfig) ? localConfig : path.join(ROOT, "config", "harnesses.example.json"));
const config = await loadGatewayConfig(configPath);
const host = process.env.CHG_HOST ?? config.server?.host ?? "127.0.0.1";
const port = Number(process.env.CHG_PORT ?? config.server?.port ?? 8787);
const tokenName = config.server?.token_env ?? "CHG_API_TOKEN";
const token = process.env[tokenName] ?? "";
if (!isLoopback(host)) throw new Error("WP02 dashboard is local-only and must bind to 127.0.0.1, ::1, or localhost");
if (!token) throw new Error(`${tokenName} is required; dashboard dispatch is never exposed without authentication`);

const registry = createRegistry(config);
const runtime = await new GatewayRuntime({ config, registry, dataRoot: process.env.CHG_DATA_ROOT ?? path.join(ROOT, "var") }).initialize();
const fleetRegistry = new FleetRegistry({ gatewayRegistry: registry });
const safeWorkspaceRoot = path.resolve(process.env.CHG_SAFE_WORKSPACE_ROOT ?? ROOT);
const missionService = new MissionService({ runtime, fleetRegistry, defaultWorkspace: ROOT, safeWorkspaceRoot });
const handler = createGatewayHandler({ runtime, fleetRegistry, missionService, token, publicRoot: path.join(ROOT, "apps", "gateway", "public") });
const server = http.createServer(handler);

server.listen(port, host, () => {
  process.stdout.write(`Cogiens War Room listening on http://${host}:${port}\n`);
  process.stdout.write(`Config: ${config.config_path}\n`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));

function isLoopback(value) { return new Set(["127.0.0.1", "::1", "localhost"]).has(value); }

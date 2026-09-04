import http from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AdapterError } from "../../../packages/adapter-sdk/src/index.mjs";
import { loadFederationRegistry } from "../../../packages/gateway-core/src/federation-registry.mjs";
import { createRegistry, loadGatewayConfig } from "../../../packages/gateway-core/src/registry.mjs";
import { GatewayRuntime } from "../../../packages/gateway-core/src/runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DASHBOARD_ROOT = path.join(ROOT, "apps", "dashboard");
const localConfig = path.join(ROOT, "config", "harnesses.local.json");
const configPath = process.env.CHG_CONFIG ?? (existsSync(localConfig) ? localConfig : path.join(ROOT, "config", "harnesses.example.json"));
const config = await loadGatewayConfig(configPath);
const host = process.env.CHG_HOST ?? config.server?.host ?? "127.0.0.1";
const port = Number(process.env.CHG_PORT ?? config.server?.port ?? 8787);
const tokenName = config.server?.token_env ?? "CHG_API_TOKEN";
const token = process.env[tokenName] ?? "";
if (!isLoopback(host) && !token) throw new Error(`${tokenName} is required when binding beyond loopback`);
const federationRegistry = await loadFederationRegistry(
  process.env.CHG_FEDERATION_REGISTRY ?? path.join(ROOT, "config", "harness-registry.v0.3.yaml"),
  { rootDirectory: ROOT }
);
const localModelPool = await loadJsonFile(path.join(ROOT, "config", "local-model-pool.v0.1.json"), { models: [] });

const runtime = await new GatewayRuntime({
  config,
  registry: createRegistry(config),
  dataRoot: process.env.CHG_DATA_ROOT ?? path.join(ROOT, "var")
}).initialize();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? `${host}:${port}`}`);

    if (request.method === "GET" && url.pathname === "/dashboard") {
      response.writeHead(302, { location: "/dashboard/" });
      return response.end();
    }
    if (request.method === "GET" && url.pathname.startsWith("/dashboard/")) {
      return serveDashboardAsset(response, url.pathname);
    }

    if (!authorized(request, token)) return send(response, 401, { error: { code: "AUTH_REQUIRED", message: "Invalid bearer token" } });
    if (request.method === "GET" && url.pathname === "/health") return send(response, 200, await runtime.health());
    if (request.method === "GET" && url.pathname === "/v1/adapters") return send(response, 200, { adapters: await runtime.listAdapters() });
    if (request.method === "GET" && url.pathname === "/v1/federation/registry") return send(response, 200, federationRegistry.snapshot());
    if (request.method === "GET" && url.pathname === "/v1/dashboard/summary") return send(response, 200, await dashboardSummary());
    const federationMatch = url.pathname.match(/^\/v1\/federation\/harnesses\/([A-Za-z0-9_.-]+)(?:\/(capabilities|passport))?$/);
    if (request.method === "GET" && federationMatch) {
      const [, harnessId, resource] = federationMatch;
      const payload = resource === "capabilities"
        ? federationRegistry.getCapabilities(harnessId)
        : resource === "passport"
          ? federationRegistry.getCombatPassport(harnessId)
          : federationRegistry.getHarness(harnessId);
      return payload
        ? send(response, 200, payload)
        : send(response, 404, { error: { code: "HARNESS_NOT_FOUND", message: "Federation harness not found" } });
    }
    if (request.method === "POST" && url.pathname === "/v1/jobs/fanout") {
      const body = await readJson(request, config.server?.max_request_bytes ?? 1024 * 1024);
      const job = await runtime.submitFanout(body);
      return send(response, 202, job, { location: `/v1/jobs/${job.job_id}` });
    }
    const jobMatch = url.pathname.match(/^\/v1\/jobs\/(job_[A-Za-z0-9_-]+)$/);
    if (request.method === "GET" && jobMatch) {
      const job = runtime.getJob(jobMatch[1]);
      return job ? send(response, 200, job) : send(response, 404, { error: { code: "NOT_FOUND", message: "Job not found" } });
    }
    const cancelMatch = url.pathname.match(/^\/v1\/jobs\/(job_[A-Za-z0-9_-]+)\/runs\/(run_[A-Za-z0-9_-]+)\/cancel$/);
    if (request.method === "POST" && cancelMatch) {
      const body = await readJson(request, 64 * 1024);
      const result = await runtime.cancelRun(cancelMatch[1], cancelMatch[2], body.reason ?? "user");
      return result ? send(response, 200, result) : send(response, 404, { error: { code: "NOT_FOUND", message: "Run not found" } });
    }
    return send(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
  } catch (error) {
    const status = error instanceof AdapterError && ["POLICY_DENIED", "WORKSPACE_INVALID", "PROTOCOL_MISMATCH"].includes(error.code) ? 400 : 500;
    return send(response, status, { error: error instanceof AdapterError ? error.toJSON() : { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) } });
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const listeningPort = typeof address === "object" && address ? address.port : port;
  process.stdout.write(`Cogiens Harness Gateway v${config.version ?? "0.3.0-alpha.1"} listening on http://${host}:${listeningPort}\n`);
  process.stdout.write(`Dashboard: http://${host}:${listeningPort}/dashboard/\n`);
  process.stdout.write(`Config: ${config.config_path}\n`);
  process.stdout.write(`Federation registry: ${federationRegistry.sourcePath}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

async function dashboardSummary() {
  const health = await runtime.health();
  const jobs = [...runtime.jobs.keys()]
    .map((jobId) => runtime.getJob(jobId))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, 50);
  return {
    schema_version: "chg.dashboard.summary.v0.1",
    checked_at: new Date().toISOString(),
    gateway: {
      status: health.status,
      version: config.version ?? "0.3.0-alpha.1",
      host,
      port
    },
    federation: federationRegistry.snapshot(),
    adapters: health.adapters,
    models: await probeOllamaModels(),
    jobs
  };
}

async function probeOllamaModels() {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const payload = await response.json();
    const installed = Array.isArray(payload.models) ? payload.models : [];
    return {
      status: "connected",
      base_url: baseUrl,
      installed_count: installed.length,
      expected_count: localModelPool.models.length,
      models: localModelPool.models.map((expected) => {
        const actual = installed.find((candidate) => ollamaTagMatches(expected.ollama_tag, candidate.name ?? candidate.model ?? ""));
        return {
          ...expected,
          installed: Boolean(actual),
          actual_tag: actual?.name ?? actual?.model ?? null,
          size_bytes: actual?.size ?? null,
          modified_at: actual?.modified_at ?? null
        };
      })
    };
  } catch (error) {
    return {
      status: "unreachable",
      base_url: baseUrl,
      expected_count: localModelPool.models.length,
      error: error instanceof Error ? error.message : String(error),
      models: localModelPool.models.map((expected) => ({ ...expected, installed: false, actual_tag: null, size_bytes: null }))
    };
  }
}

function ollamaTagMatches(expected, actual) {
  const left = String(expected).toLowerCase();
  const right = String(actual).toLowerCase();
  if (left === right) return true;
  return !left.includes(":") && `${left}:latest` === right;
}

async function serveDashboardAsset(response, pathname) {
  const files = new Map([
    ["/dashboard/", ["index.html", "text/html; charset=utf-8"]],
    ["/dashboard/index.html", ["index.html", "text/html; charset=utf-8"]],
    ["/dashboard/styles.css", ["styles.css", "text/css; charset=utf-8"]],
    ["/dashboard/proportions.css", ["proportions.css", "text/css; charset=utf-8"]],
    ["/dashboard/header-shell.css", ["header-shell.css", "text/css; charset=utf-8"]],
    ["/dashboard/dashboard.js", ["dashboard.js", "text/javascript; charset=utf-8"]],
    ["/dashboard/cogiens-mark.png", ["cogiens-mark.png", "image/png"]],
    ["/dashboard/shuishu-logo.svg", ["shuishu-logo.svg", "image/svg+xml; charset=utf-8"]],
    ["/dashboard/shuishu.ico", ["shuishu.ico", "image/x-icon"]]
  ]);
  const asset = files.get(pathname);
  if (!asset) return send(response, 404, { error: { code: "NOT_FOUND", message: "Dashboard asset not found" } });
  const [fileName, contentType] = asset;
  const body = await readFile(path.join(DASHBOARD_ROOT, fileName));
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": [
      "default-src 'self'",
      "script-src 'self' https://www.cogiens.com https://cogiens.com",
      "style-src 'self' 'unsafe-inline' https://www.cogiens.com https://cogiens.com",
      "img-src 'self' data: https://www.cogiens.com https://cogiens.com",
      "font-src 'self' data: https://www.cogiens.com https://cogiens.com",
      "connect-src 'self' https://www.cogiens.com https://cogiens.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'"
    ].join("; ")
  });
  response.end(body);
}

async function loadJsonFile(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return fallback; }
}

function authorized(request, expected) {
  if (!expected) return true;
  return request.headers.authorization === `Bearer ${expected}`;
}

function isLoopback(value) {
  return new Set(["127.0.0.1", "::1", "localhost"]).has(value);
}

async function readJson(request, maxBytes) {
  let body = "";
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new AdapterError("POLICY_DENIED", "Request body is too large");
    body += chunk.toString("utf8");
  }
  try { return body ? JSON.parse(body) : {}; } catch { throw new AdapterError("PROTOCOL_MISMATCH", "Request body must be valid JSON"); }
}

function send(response, status, payload, headers = {}) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), ...headers });
  response.end(body);
}

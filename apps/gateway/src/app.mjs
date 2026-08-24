import { readFile } from "node:fs/promises";
import path from "node:path";

import { AdapterError } from "../../../packages/adapter-sdk/src/index.mjs";

export function createGatewayHandler({ runtime, fleetRegistry, missionService, token = "", publicRoot }) {
  return async function handle(request, response) {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) return sendFile(response, path.join(publicRoot, "index.html"), "text/html; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/dashboard.js") return sendFile(response, path.join(publicRoot, "dashboard.js"), "text/javascript; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/dashboard.css") return sendFile(response, path.join(publicRoot, "dashboard.css"), "text/css; charset=utf-8");
      if (!authorized(request, token)) return sendJson(response, 401, { error: { code: "AUTH_REQUIRED", message: "Valid bearer token required" } });
      if (request.method === "GET" && url.pathname === "/health") return sendJson(response, 200, await runtime.health());
      if (request.method === "GET" && url.pathname === "/v1/adapters") return sendJson(response, 200, { adapters: await runtime.listAdapters() });
      if (request.method === "GET" && url.pathname === "/api/v1/fleet") return sendJson(response, 200, { fleet: await fleetRegistry.list() });
      if (request.method === "POST" && url.pathname === "/api/v1/missions") {
        const mission = missionService.create(await readJson(request, 1024 * 1024));
        return sendJson(response, 201, mission, { location: `/api/v1/missions/${mission.mission_id}` });
      }
      const dispatch = url.pathname.match(/^\/api\/v1\/missions\/(mis_[A-Za-z0-9_-]+)\/dispatch$/);
      if (request.method === "POST" && dispatch) return sendJson(response, 202, await missionService.dispatch(dispatch[1]));
      const run = url.pathname.match(/^\/api\/v1\/runs\/(run_[A-Za-z0-9_-]+)$/);
      if (request.method === "GET" && run) {
        const value = missionService.getRun(run[1]);
        return value ? sendJson(response, 200, value) : sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Run not found" } });
      }
      const events = url.pathname.match(/^\/api\/v1\/runs\/(run_[A-Za-z0-9_-]+)\/events$/);
      if (request.method === "GET" && events) {
        const value = missionService.getRun(events[1]);
        return value ? sendJson(response, 200, { run_id: value.run_id, events: value.events }) : sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Run not found" } });
      }
      if (request.method === "POST" && url.pathname === "/v1/jobs/fanout") {
        const job = await runtime.submitFanout(await readJson(request, 1024 * 1024));
        return sendJson(response, 202, job, { location: `/v1/jobs/${job.job_id}` });
      }
      const job = url.pathname.match(/^\/v1\/jobs\/(job_[A-Za-z0-9_-]+)$/);
      if (request.method === "GET" && job) {
        const value = runtime.getJob(job[1]);
        return value ? sendJson(response, 200, value) : sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Job not found" } });
      }
      const cancel = url.pathname.match(/^\/v1\/jobs\/(job_[A-Za-z0-9_-]+)\/runs\/(run_[A-Za-z0-9_-]+)\/cancel$/);
      if (request.method === "POST" && cancel) {
        const body = await readJson(request, 64 * 1024);
        const value = await runtime.cancelRun(cancel[1], cancel[2], body.reason ?? "user");
        return value ? sendJson(response, 200, value) : sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Run not found" } });
      }
      return sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
    } catch (error) {
      const code = error instanceof AdapterError ? error.code : "INTERNAL_ERROR";
      const status = code === "HARNESS_NOT_FOUND" ? 404 : ["POLICY_DENIED", "WORKSPACE_INVALID", "PROTOCOL_MISMATCH", "CAPABILITY_UNSUPPORTED"].includes(code) ? 400 : 500;
      return sendJson(response, status, { error: error instanceof AdapterError ? error.toJSON() : { code, message: error instanceof Error ? error.message : String(error) } });
    }
  };
}

function authorized(request, expected) { return Boolean(expected) && request.headers.authorization === `Bearer ${expected}`; }

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

async function sendFile(response, file, contentType) {
  const body = await readFile(file);
  response.writeHead(200, { "content-type": contentType, "content-length": body.length, "cache-control": "no-store" });
  response.end(body);
}

function sendJson(response, status, payload, headers = {}) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), ...headers });
  response.end(body);
}

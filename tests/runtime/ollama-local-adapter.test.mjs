import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { createOllamaLocalAdapter } from "../../adapters/ollama-local/src/index.mjs";
import { collectEvents, requireEvent } from "../../packages/conformance-kit/src/index.mjs";

let counter = 0;

async function withFakeLocalRuntime(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function session(instance, workspace) {
  counter += 1;
  const uri = pathToFileURL(workspace).href;
  return instance.createSession({}, {
    contract_version: "chg.adapter.v0.1",
    job_id: `job_local_${counter}`,
    run_id: `run_local_${counter}`,
    trace_id: `trc_local_${counter}`,
    project_id: "CGS-LOCAL-001",
    workspace: { uri, mode: "local-bounded-workspace", read_only_roots: [], write_roots: [uri] },
    identity: { tenant_id: "local", user_id: "test", actor_type: "human" },
    credentials: [],
    policy: { network: "restricted", approval_mode: "never", max_runtime_seconds: 5, max_output_bytes: 64 * 1024 }
  });
}

test("local execution adapter reports healthy and returns a durable text artifact", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "chg-local-"));
  const fake = await withFakeLocalRuntime(async (request, response) => {
    if (request.url === "/api/tags") {
      response.writeHead(200, { "content-type": "application/json" });
      return response.end(JSON.stringify({ models: [{ name: "local-model:test" }] }));
    }
    if (request.url === "/api/generate" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk.toString("utf8");
      const payload = JSON.parse(body);
      assert.equal(payload.model, "local-model:test");
      assert.equal(payload.prompt, "Summarize this locally.");
      response.writeHead(200, { "content-type": "application/json" });
      return response.end(JSON.stringify({ response: "Local result.", prompt_eval_count: 12, eval_count: 4 }));
    }
    response.writeHead(404).end();
  });

  const instance = createOllamaLocalAdapter({
    id: "cogiens.h01.local",
    kind: "ollama-local",
    model: "local-model:test",
    resource_id: "M01",
    base_url: fake.baseUrl
  });

  try {
    const health = await instance.health();
    assert.equal(health.status, "healthy");
    assert.equal(health.details.resource_id, "M01");

    const handle = await session(instance, workspace);
    const events = await collectEvents(instance.startRun({}, handle, { prompt: { text: "Summarize this locally." } }));
    assert.equal(requireEvent(events, "assistant.message.completed").payload.message, "Local result.");
    assert.equal(requireEvent(events, "usage.updated").payload.estimated_cost, 0);
    requireEvent(events, "run.succeeded");

    const artifacts = await collectEvents(instance.collectArtifacts({}, handle));
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].content, "Local result.");
  } finally {
    await fake.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("local execution adapter fails health when its assigned resource is absent", async () => {
  const fake = await withFakeLocalRuntime((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ models: [{ name: "different:latest" }] }));
  });
  const instance = createOllamaLocalAdapter({
    id: "cogiens.h02.local",
    kind: "ollama-local",
    model: "missing-model",
    resource_id: "M02",
    base_url: fake.baseUrl
  });
  try {
    const health = await instance.health();
    assert.equal(health.status, "unhealthy");
    assert.equal(health.details.reason, "local_resource_missing");
  } finally {
    await fake.close();
  }
});

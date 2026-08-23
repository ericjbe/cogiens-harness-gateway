import assert from "node:assert/strict";
import test from "node:test";

import { createCodexCliAdapter } from "../../adapters/codex-cli/src/index.mjs";

test("H01-001 descriptor remains fail-closed for approvals and resume", async () => {
  const adapter = createCodexCliAdapter();
  const descriptor = await adapter.describe();
  assert.equal(descriptor.adapter_version, "0.3.0-alpha.1");
  assert.equal(descriptor.capabilities.structured_output, true);
  assert.equal(descriptor.capabilities.approvals, false);
  assert.equal(descriptor.capabilities.resume, false);
});

test("H01-002 invocation uses documented non-interactive and bounded flags", () => {
  const adapter = createCodexCliAdapter();
  const invocation = adapter.options.buildInvocation({ cwd: "/workspace/project", policy: { network: "restricted" } });
  assert.deepEqual(invocation.args.slice(0, 3), ["exec", "--json", "--ephemeral"]);
  assert.ok(invocation.args.includes("workspace-write"));
  assert.ok(invocation.args.includes("never"));
  assert.equal(invocation.args.at(-1), "-");
  assert.ok(!invocation.args.includes("--yolo"));
  assert.ok(!invocation.args.includes("danger-full-access"));
  assert.ok(!invocation.args.includes("--search"));
});

test("H01-003 parser returns the final agent message and usage", () => {
  const adapter = createCodexCliAdapter();
  const stdout = [
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "first" } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "final" } }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 4 } })
  ].join("\n");
  const result = adapter.options.parseOutput({ stdout, stderr: "", code: 0 });
  assert.equal(result.success, true);
  assert.equal(result.finalText, "final");
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 4 });
});

test("H01-004 parser maps vendor failure without pretending success", () => {
  const adapter = createCodexCliAdapter();
  const result = adapter.options.parseOutput({
    stdout: JSON.stringify({ type: "turn.failed", error: { message: "provider unavailable" } }),
    stderr: "",
    code: 1
  });
  assert.equal(result.success, false);
  assert.equal(result.error.code, "HARNESS_CRASHED");
  assert.equal(result.error.message, "provider unavailable");
});

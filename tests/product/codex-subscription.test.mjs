import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createCodexCliAdapter } from "../../adapters/codex-cli/src/index.mjs";
import { runChild } from "../../adapters/process/src/one-shot-process-adapter.mjs";

test("public example keeps the real Codex harness disabled", async () => {
  const config = JSON.parse(await readFile(new URL("../../config/harnesses.example.json", import.meta.url), "utf8"));
  const codex = config.adapters.find((adapter) => adapter.id === "openai.codex.cli");
  assert.ok(codex);
  assert.equal(codex.enabled, false);
});

test("H01 uses non-interactive codex exec stdin and has no API-key fallback", () => {
  const adapter = createCodexCliAdapter({ id: "openai.codex.cli" });
  const invocation = adapter.options.buildInvocation({ cwd: process.cwd(), policy: { network: "restricted" } });
  assert.deepEqual(invocation.args.slice(0, 3), ["-c", 'approval_policy="never"', "exec"]);
  assert.ok(invocation.args.includes("--json"));
  assert.ok(invocation.args.includes("--ephemeral"));
  assert.equal(invocation.args.at(-1), "-");
  assert.equal(invocation.env, undefined);
  assert.doesNotMatch(JSON.stringify(invocation), /OPENAI_API_KEY|api[_-]?key/i);
  assert.ok(!invocation.args.includes("--ask-for-approval"));
  assert.ok(invocation.args.indexOf("-c") < invocation.args.indexOf("exec"));
});

test("Codex spawn boundary removes OPENAI_API_KEY from inherited operator environment", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "operator-key-must-not-reach-child";
  try {
    const result = await runChild({
      command: process.execPath,
      args: ["-e", "process.stdout.write(process.env.OPENAI_API_KEY === undefined ? 'absent' : 'present')"],
      stdin: "",
      cwd: process.cwd(),
      blockedEnv: ["OPENAI_API_KEY"],
      timeoutMs: 5_000,
      maxOutputBytes: 1024
    });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "absent");
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

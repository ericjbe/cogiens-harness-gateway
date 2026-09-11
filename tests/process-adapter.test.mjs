import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rename, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

import { OneShotProcessAdapter } from "../adapters/process/src/one-shot-process-adapter.mjs";
import { captureWorkspaceBaseline, compareManifests } from "../adapters/process/src/workspace-artifacts.mjs";

const binding = { job_id: "job_evidence", run_id: "run_evidence", trace_id: "trc_evidence", project_id: "test" };

function adapterFor(script) {
  return new OneShotProcessAdapter({
    adapterId: "test.process",
    command: process.execPath,
    versionArgs: ["--version"],
    buildInvocation: () => ({ args: ["-e", script], stdin: "" }),
    parseOutput: ({ stdout, code }) => ({ success: code === 0, finalText: stdout.trim() })
  });
}

async function runIn(workspace, script) {
  const adapter = adapterFor(script);
  const uri = pathToFileURL(workspace).href;
  const session = await adapter.createSession({}, { ...binding, workspace: { uri, write_roots: [uri] }, policy: { max_runtime_seconds: 10, max_output_bytes: 1024 * 1024 } });
  const events = [];
  for await (const event of adapter.startRun({}, session, { prompt: { text: "test" } })) events.push(event);
  const artifacts = [];
  for await (const artifact of adapter.collectArtifacts({}, session)) artifacts.push(artifact);
  return { events, artifacts };
}

test("non-git workspace produces task-bound changed-file and report artifacts", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "shuishu-process-"));
  const target = path.join(workspace, "answer.md");
  const result = await runIn(workspace, `require('node:fs').writeFileSync(${JSON.stringify(target)}, 'REAL_OUTPUT') ; console.log('DONE')`);
  assert.equal(result.events.at(-1).type, "run.succeeded");
  assert.ok(result.artifacts.some((item) => item.kind === "workspace-file-snapshot" && item.content.includes("REAL_OUTPUT")));
  assert.ok(result.artifacts.some((item) => item.kind === "workspace-change-report"));
  assert.ok(result.artifacts.every((item) => item.job_id === binding.job_id && item.run_id === binding.run_id && item.trace_id === binding.trace_id));
});

test("git workspace produces a real git patch", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "shuishu-git-"));
  execFileSync("git", ["init", "-q"], { cwd: workspace });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: workspace });
  execFileSync("git", ["config", "user.name", "test"], { cwd: workspace });
  await writeFile(path.join(workspace, "tracked.txt"), "before\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: workspace });
  execFileSync("git", ["commit", "-qm", "baseline"], { cwd: workspace });
  const target = path.join(workspace, "tracked.txt");
  const result = await runIn(workspace, `require('node:fs').writeFileSync(${JSON.stringify(target)}, 'after\\n'); console.log('DONE')`);
  const patch = result.artifacts.find((item) => item.kind === "git-patch");
  assert.ok(patch);
  assert.match(patch.content, /-before/);
  assert.match(patch.content, /\+after/);
});

test("manifest comparison reports added, modified and deleted files", () => {
  const changes = compareManifests(
    [{ path: "a", sha256: "1", size_bytes: 1 }, { path: "b", sha256: "2", size_bytes: 1 }],
    [{ path: "a", sha256: "3", size_bytes: 1 }, { path: "c", sha256: "4", size_bytes: 1 }]
  );
  assert.deepEqual(changes.map((item) => [item.path, item.status]), [["a", "modified"], ["b", "deleted"], ["c", "added"]]);
});

test('git artifact capture rejects a tracked directory replaced by an external link', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'shuishu-boundary-'));
  const folder = path.join(workspace, 'tracked');
  await mkdir(folder); await writeFile(path.join(folder, 'item.txt'), 'fixture');
  execFileSync('git', ['init', '-q'], {cwd: workspace});
  execFileSync('git', ['add', 'tracked/item.txt'], {cwd: workspace});
  execFileSync('git', ['-c','user.name=test','-c','user.email=test@example.invalid','commit','-qm','fixture baseline'], {cwd: workspace});
  const outside = await mkdtemp(path.join(os.tmpdir(), 'shuishu-outside-'));
  await writeFile(path.join(outside, 'item.txt'), 'outside fixture');
  await rename(folder, path.join(workspace, 'old-tracked'));
  await symlink(outside, folder, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(captureWorkspaceBaseline(workspace), /symlink rejected/);
});

test("execution log is collected and secret-shaped output is redacted", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "shuishu-log-"));
  const result = await runIn(workspace, "console.log(['s', 'k-', 'abcdefghijklmnopqrstuvwxyz'].join(''))");
  const log = result.artifacts.find((item) => item.kind === "execution-log");
  assert.ok(log);
  assert.doesNotMatch(log.content, new RegExp(["s", "k-", "abcdefghijklmnopqrstuvwxyz"].join("")));
  assert.match(log.content, /REDACTED/);
});

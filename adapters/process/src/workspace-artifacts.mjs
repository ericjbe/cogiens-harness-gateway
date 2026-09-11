import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat, lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { createTextArtifact } from "../../../packages/adapter-sdk/src/index.mjs";

const IGNORED = new Set([".git", "node_modules", ".venv", "venv"]);
const MAX_FILES = 10_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export async function captureWorkspaceBaseline(workspace) {
  const root = path.resolve(workspace);
  const details = await stat(root);
  if (!details.isDirectory()) throw new Error("Workspace is not a directory");
  const git = await gitMetadata(root);
  const manifest = git.is_git ? await gitManifest(root) : await filesystemManifest(root);
  return {
    schema_version: "shuishu.workspace-baseline.v1",
    captured_at: new Date().toISOString(),
    root,
    git,
    manifest
  };
}

export async function createProcessEvidenceArtifacts(binding, baseline, workspace, outcome) {
  const current = await captureWorkspaceBaseline(workspace);
  if (baseline.root !== current.root || baseline.git.is_git !== current.git.is_git) {
    throw new Error("Workspace identity changed during execution");
  }
  const changes = compareManifests(baseline.manifest, current.manifest);
  const artifacts = [];
  artifacts.push(createTextArtifact(binding, {
    kind: "execution-log",
    media_type: "application/json",
    content: JSON.stringify({
      exit_code: outcome.code,
      signal: outcome.signal,
      timed_out: outcome.timedOut,
      output_exceeded: outcome.outputExceeded,
      stdout: String(outcome.stdout ?? ""),
      stderr: String(outcome.stderr ?? "")
    }, null, 2)
  }));

  if (current.git.is_git) {
    const patch = await run("git", ["-C", current.root, "diff", "--binary", "--no-ext-diff", "HEAD", "--"]);
    if (patch.stdout) artifacts.push(createTextArtifact(binding, { kind: "git-patch", media_type: "text/x-diff", content: patch.stdout }));
  }

  for (const item of changes.filter((entry) => entry.status !== "deleted")) {
    const absolute = await confinedWorkspaceFile(current.root, item.path);
    const info = await stat(absolute);
    if (info.size > MAX_FILE_BYTES) {
      artifacts.push(createTextArtifact(binding, {
        kind: "workspace-file-record",
        media_type: "application/json",
        content: JSON.stringify({ ...item, content_omitted: true, reason: "file_exceeds_capture_limit" }, null, 2)
      }));
      continue;
    }
    const bytes = await readFile(absolute);
    const text = isProbablyText(bytes) ? bytes.toString("utf8") : bytes.toString("base64");
    const reportLike = /(^|\/)(test-results?|reports?|coverage)(\/|\.|$)|junit|tap\.txt/i.test(item.path);
    artifacts.push(createTextArtifact(binding, {
      kind: reportLike ? "test-report" : "workspace-file-snapshot",
      media_type: "application/json",
      content: JSON.stringify({
        ...item,
        encoding: isProbablyText(bytes) ? "utf8" : "base64",
        content: text
      }, null, 2)
    }));
  }

  artifacts.push(createTextArtifact(binding, {
    kind: "workspace-change-report",
    media_type: "application/json",
    content: JSON.stringify({
      schema_version: "shuishu.workspace-change-report.v1",
      baseline_captured_at: baseline.captured_at,
      completed_at: new Date().toISOString(),
      git_head_before: baseline.git.head,
      git_head_after: current.git.head,
      baseline_dirty: baseline.git.dirty,
      changes,
      artifact_count_including_report: artifacts.length + 1
    }, null, 2)
  }));
  return artifacts;
}

export function compareManifests(before, after) {
  const left = new Map(before.map((item) => [item.path, item]));
  const right = new Map(after.map((item) => [item.path, item]));
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
  return paths.flatMap((name) => {
    const old = left.get(name), current = right.get(name);
    if (!old) return [{ ...current, status: "added" }];
    if (!current) return [{ ...old, status: "deleted" }];
    if (old.sha256 !== current.sha256 || old.size_bytes !== current.size_bytes) return [{ ...current, previous_sha256: old.sha256, status: "modified" }];
    return [];
  });
}

async function gitMetadata(root) {
  const inside = await run("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], true);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") return { is_git: false, head: null, dirty: false };
  const head = await run("git", ["-C", root, "rev-parse", "HEAD"]);
  const status = await run("git", ["-C", root, "status", "--porcelain=v1", "--untracked-files=all"]);
  return { is_git: true, head: head.stdout.trim(), dirty: Boolean(status.stdout.trim()), status: status.stdout };
}

async function gitManifest(root) {
  const result = await run("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"]);
  const names = result.stdout.split("\0").filter(Boolean).sort();
  if (names.length > MAX_FILES) throw new Error(`Workspace contains more than ${MAX_FILES} capturable files`);
  return buildManifest(root, names);
}

async function filesystemManifest(root) {
  const names = [];
  async function walk(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || IGNORED.has(entry.name)) continue;
      const childRelative = relative ? path.posix.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), childRelative);
      else if (entry.isFile()) names.push(childRelative);
      if (names.length > MAX_FILES) throw new Error(`Workspace contains more than ${MAX_FILES} capturable files`);
    }
  }
  await walk(root);
  return buildManifest(root, names.sort());
}

async function buildManifest(root, names) {
  const output = [];
  for (const name of names) {
    const absolute = await confinedWorkspaceFile(root, name);
    const bytes = await readFile(absolute);
    output.push({ path: name.replaceAll("\\", "/"), size_bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  return output;
}

async function confinedWorkspaceFile(root, name) {
  const base = await realpath(root);
  let cursor = base;
  for (const part of name.split('/')) {
    if (!part || part === '..' || part === '.' || part.includes('\\')) throw new Error('Workspace artifact path rejected');
    cursor = path.join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Workspace artifact symlink rejected');
  }
  const resolved = await realpath(cursor), relative = path.relative(base, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Workspace artifact escaped boundary');
  return resolved;
}

function isProbablyText(bytes) {
  if (bytes.includes(0)) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096)).toString("utf8");
  return !sample.includes("\uFFFD");
}

function run(command, args, acceptFailure = false) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (error, stdout = "", stderr = "") => {
      const code = typeof error?.code === "number" ? error.code : error ? 1 : 0;
      if (error && !acceptFailure) reject(new Error(`${command} failed: ${stderr || error.message}`));
      else resolve({ code, stdout, stderr });
    });
  });
}

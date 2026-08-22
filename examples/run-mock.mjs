import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { MockHarnessAdapter } from "../adapters/mock/src/index.mjs";

const adapter = new MockHarnessAdapter();
const workspacePath = await mkdtemp(path.join(os.tmpdir(), "chg-example-"));
const workspaceUri = pathToFileURL(workspacePath).href;

try {
  const session = await adapter.createSession({ actor: "example" }, {
    contract_version: "chg.adapter.v0.1",
    job_id: "job_example",
    run_id: "run_example",
    trace_id: "trc_example",
    project_id: "CGS-HG-001",
    workspace: {
      uri: workspaceUri,
      mode: "isolated-worktree",
      read_only_roots: [],
      write_roots: [workspaceUri]
    },
    identity: {
      tenant_id: "tenant_local",
      user_id: "user_local",
      actor_type: "human"
    },
    credentials: [],
    policy: {
      network: "restricted",
      approval_mode: "on-request",
      max_runtime_seconds: 30,
      max_output_bytes: 1048576
    }
  });

  for await (const event of adapter.startRun({ actor: "example" }, session, {
    prompt: { text: "Produce a dependency-free mock result." }
  })) {
    console.log(`${event.sequence.toString().padStart(2, "0")} ${event.type}`);
  }

  const artifacts = [];
  for await (const artifact of adapter.collectArtifacts({}, session)) artifacts.push(artifact);
  console.log(`Artifacts: ${artifacts.length}; SHA-256: ${artifacts[0]?.sha256 ?? "none"}`);
  await adapter.close({}, session);
} finally {
  await rm(workspacePath, { recursive: true, force: true });
}

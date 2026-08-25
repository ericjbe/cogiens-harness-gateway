import { randomUUID } from "node:crypto";
import path from "node:path";

import { AdapterError, redactSecrets } from "../../adapter-sdk/src/index.mjs";

export class MissionService {
  constructor({ runtime, fleetRegistry, defaultWorkspace = process.cwd(), safeWorkspaceRoot = defaultWorkspace }) {
    this.runtime = runtime;
    this.fleetRegistry = fleetRegistry;
    this.defaultWorkspace = path.resolve(defaultWorkspace);
    this.safeWorkspaceRoot = path.resolve(safeWorkspaceRoot);
    this.missions = new Map();
    this.runToJob = new Map();
  }

  create(input) {
    if (!input || typeof input !== "object") throw new AdapterError("PROTOCOL_MISMATCH", "Mission body is required");
    if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new AdapterError("PROTOCOL_MISMATCH", "prompt is required");
    const fleet = input.fleet ?? input.harness_ids ?? [];
    if (!Array.isArray(fleet) || fleet.length === 0) throw new AdapterError("PROTOCOL_MISMATCH", "At least one fleet harness is required");
    for (const id of fleet) if (!this.fleetRegistry.getDefinition(id)) throw new AdapterError("PROTOCOL_MISMATCH", `Unknown harness: ${id}`);
    const workspace = path.resolve(input.workspace ?? this.defaultWorkspace);
    const relativeWorkspace = path.relative(this.safeWorkspaceRoot, workspace);
    if (relativeWorkspace === ".." || relativeWorkspace.startsWith(`..${path.sep}`) || path.isAbsolute(relativeWorkspace)) {
      throw new AdapterError("WORKSPACE_INVALID", `Workspace must be within the configured safe root: ${this.safeWorkspaceRoot}`);
    }
    const now = new Date().toISOString();
    const mission = {
      mission_id: `mis_${randomUUID().replaceAll("-", "")}`,
      project: String(input.project ?? "Local Project"),
      campaign: String(input.campaign ?? "Local Campaign"),
      title: String(input.title ?? "Untitled Mission"),
      prompt: input.prompt,
      fleet: [...new Set(fleet)],
      roles: input.roles && typeof input.roles === "object" ? structuredClone(input.roles) : {},
      workspace,
      state: "DRAFT",
      run_ids: [],
      created_at: now,
      updated_at: now
    };
    this.missions.set(mission.mission_id, mission);
    return publicMission(mission);
  }

  async dispatch(missionId) {
    const mission = this.missions.get(missionId);
    if (!mission) throw new AdapterError("HARNESS_NOT_FOUND", "Mission not found");
    if (mission.state !== "DRAFT") throw new AdapterError("PROTOCOL_MISMATCH", "Mission was already dispatched");
    const unsupported = mission.fleet.filter((id) => !this.fleetRegistry.adapterIdFor(id));
    if (unsupported.length) {
      throw new AdapterError("CAPABILITY_UNSUPPORTED", `Dispatch is not implemented for ${unsupported.join(", ")}`, { details: { harness_ids: unsupported } });
    }
    const adapters = mission.fleet.map((id) => this.fleetRegistry.adapterIdFor(id));
    const job = await this.runtime.submitFanout({
      project_id: mission.project,
      prompt: mission.prompt,
      workspace: mission.workspace,
      adapters
    });
    mission.state = "DISPATCHED";
    mission.job_id = job.job_id;
    mission.run_ids = job.runs.map((run) => run.run_id);
    mission.updated_at = new Date().toISOString();
    for (const run of job.runs) this.runToJob.set(run.run_id, job.job_id);
    return { mission: publicMission(mission), job };
  }

  getRun(runId) {
    const jobId = this.runToJob.get(runId);
    return jobId ? this.runtime.getJob(jobId)?.runs.find((run) => run.run_id === runId) ?? null : null;
  }
}

function publicMission(mission) {
  const result = redactSecrets(structuredClone(mission));
  delete result.prompt;
  return result;
}

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { FleetRegistry } from "../../packages/gateway-core/src/fleet-registry.mjs";
import { MissionService } from "../../packages/gateway-core/src/mission-service.mjs";

test("mission creation preserves fleet selection and mocked dispatch accepts H01", async () => {
  let submitted;
  const runtime = {
    submitFanout: async (input) => {
      submitted = input;
      return { job_id: "job_mock", runs: [{ run_id: "run_mock", state: "QUEUED", events: [] }] };
    },
    getJob: () => ({ runs: [{ run_id: "run_mock", state: "SUCCEEDED", events: [{ type: "run.succeeded" }] }] })
  };
  const fleetRegistry = new FleetRegistry({ probeCommand: async () => ({ ok: false, reason: "executable_not_found" }) });
  const service = new MissionService({ runtime, fleetRegistry, defaultWorkspace: process.cwd() });
  const mission = service.create({ project: "P", campaign: "C", prompt: "Implement it", fleet: ["H01"], roles: { H01: "Lead" } });
  assert.deepEqual(mission.fleet, ["H01"]);
  assert.equal(mission.roles.H01, "Lead");
  assert.equal(mission.prompt, undefined);
  const result = await service.dispatch(mission.mission_id);
  assert.deepEqual(submitted.adapters, ["openai.codex.cli"]);
  assert.equal(submitted.prompt, "Implement it");
  assert.equal(result.job.runs[0].run_id, "run_mock");
  assert.equal(service.getRun("run_mock").state, "SUCCEEDED");
});

test("unadapted fleet dispatch fails explicitly", async () => {
  const fleetRegistry = new FleetRegistry({ probeCommand: async () => ({ ok: false }) });
  const service = new MissionService({ runtime: {}, fleetRegistry, defaultWorkspace: process.cwd() });
  const mission = service.create({ prompt: "Try unsupported", fleet: ["H02"] });
  await assert.rejects(() => service.dispatch(mission.mission_id), (error) => error.code === "CAPABILITY_UNSUPPORTED");
});

test("mission workspace cannot escape configured safe root", () => {
  const fleetRegistry = new FleetRegistry({ probeCommand: async () => ({ ok: false }) });
  const service = new MissionService({ runtime: {}, fleetRegistry, defaultWorkspace: process.cwd(), safeWorkspaceRoot: process.cwd() });
  assert.throws(
    () => service.create({ prompt: "Escape", fleet: ["H01"], workspace: path.resolve(process.cwd(), "..") }),
    (error) => error.code === "WORKSPACE_INVALID"
  );
});

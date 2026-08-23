import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadFederationRegistry } from "../packages/gateway-core/src/federation-registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = await loadFederationRegistry(path.join(root, "config", "harness-registry.v0.3.yaml"), { rootDirectory: root });
const firstClass = registry.listHarnesses({ includeAuxiliary: false });

assert.deepEqual(firstClass.map((entry) => entry.harness_id), ["H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08"]);
assert.ok(firstClass.every((entry) => entry.integration_tier === "FIRST_CLASS"));

const h01 = registry.getHarness("H01");
assert.equal(h01.support_status, "CONFORMANCE_PARTIAL");
assert.equal(h01.local_deployment_status, "NOT_PROBED");
assert.equal(registry.getCombatPassport("H01").status, "NOT_READY");
assert.equal(registry.evaluateSupportTransition("H01", "CONFORMANCE_VERIFIED").allowed, false);

for (const harness of firstClass.slice(1)) {
  assert.equal(harness.support_status, "DECLARED_UNVERIFIED", `${harness.harness_id} must remain unverified`);
  assert.equal(harness.local_deployment_status, "NOT_PROBED", `${harness.harness_id} must not claim local discovery`);
  assert.equal(harness.default_capability_state, "UNKNOWN", `${harness.harness_id} capabilities must remain unknown`);
}

console.log("PASS verify-federation-registry: 8 first-class targets; H01 partial only; H02-H08 unverified");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FederationRegistryError,
  evaluateSupportTransition,
  loadFederationRegistry,
  validateRegistryDocument
} from "../../packages/gateway-core/src/federation-registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = path.join(root, "config", "harness-registry.v0.3.yaml");

test("P2A-001 registry loads eight first-class harnesses and one auxiliary path", async () => {
  const registry = await loadFederationRegistry(registryPath, { rootDirectory: root });
  assert.equal(registry.listHarnesses({ includeAuxiliary: false }).length, 8);
  assert.equal(registry.listHarnesses().length, 9);
  assert.equal(registry.snapshot().runtime_implemented, true);
});

test("P2A-002 lookup supports harness ID and canonical name", async () => {
  const registry = await loadFederationRegistry(registryPath, { rootDirectory: root });
  assert.equal(registry.getHarness("h01").canonical_name, "OPENAI_CODEX");
  assert.equal(registry.getHarness("openai_codex").harness_id, "H01");
  assert.equal(registry.getHarness("missing"), null);
});

test("P2A-003 global support and machine-local deployment states remain independent", async () => {
  const registry = await loadFederationRegistry(registryPath, { rootDirectory: root });
  const h01 = registry.getHarness("H01");
  assert.equal(h01.support_status, "CONFORMANCE_PARTIAL");
  assert.equal(h01.local_deployment_status, "NOT_PROBED");
});

test("P2A-004 undeveloped harness capabilities fail closed as UNKNOWN", async () => {
  const registry = await loadFederationRegistry(registryPath, { rootDirectory: root });
  const h02 = registry.getCapabilities("H02");
  assert.equal(h02.default_capability_state, "UNKNOWN");
  assert.deepEqual(h02.capabilities, {});
});

test("P2A-005 H01 Combat Passport is loaded but remains NOT_READY", async () => {
  const registry = await loadFederationRegistry(registryPath, { rootDirectory: root });
  const passport = registry.getCombatPassport("H01");
  assert.equal(passport.status, "NOT_READY");
  assert.equal(passport.evaluated_support_status, "CONFORMANCE_PARTIAL");
  assert.ok(passport.blocking_gaps.length >= 4);
});

test("P2A-006 evidence permits only the adjacent partial transition", async () => {
  const registry = await loadFederationRegistry(registryPath, { rootDirectory: root });
  const passport = registry.getCombatPassport("H01");
  const result = evaluateSupportTransition("DECLARED_UNVERIFIED", "CONFORMANCE_PARTIAL", passport.evidence);
  assert.equal(result.allowed, true);
  assert.deepEqual(result.missing_evidence, []);
});

test("P2A-007 transition cannot skip a support level", () => {
  const result = evaluateSupportTransition("DECLARED_UNVERIFIED", "CONFORMANCE_VERIFIED", []);
  assert.equal(result.allowed, false);
  assert.deepEqual(result.missing_evidence, ["adjacent_transition_required"]);
});

test("P2A-008 H01 cannot advance to verified without live conformance evidence", async () => {
  const registry = await loadFederationRegistry(registryPath, { rootDirectory: root });
  const result = registry.evaluateSupportTransition("H01", "CONFORMANCE_VERIFIED");
  assert.equal(result.allowed, false);
  assert.ok(result.missing_evidence.includes("conformance_suite"));
  assert.ok(result.missing_evidence.includes("platform_matrix"));
});

test("P2A-009 BLOCKED requires an explicit reason", () => {
  assert.equal(evaluateSupportTransition("CONFORMANCE_PARTIAL", "BLOCKED", []).allowed, false);
  assert.equal(evaluateSupportTransition("CONFORMANCE_PARTIAL", "BLOCKED", [], { reason: "upstream incident" }).allowed, true);
});

test("P2A-010 duplicate IDs and invalid capability states are rejected", async () => {
  const document = JSON.parse(await readFile(registryPath, "utf8"));
  document.harnesses[1].harness_id = "H01";
  assert.throws(() => validateRegistryDocument(document), FederationRegistryError);

  const invalidCapability = JSON.parse(await readFile(registryPath, "utf8"));
  invalidCapability.harnesses[0].capabilities.trace = "MAYBE";
  assert.throws(() => validateRegistryDocument(invalidCapability), /capability trace/);
});

test("P2A-011 public evidence contains no credential values", async () => {
  const registry = await loadFederationRegistry(registryPath, { rootDirectory: root });
  const serialized = JSON.stringify(registry.getCombatPassport("H01"));
  assert.doesNotMatch(serialized, /access[_-]?token|refresh[_-]?token|api[_-]?key|password/i);
});

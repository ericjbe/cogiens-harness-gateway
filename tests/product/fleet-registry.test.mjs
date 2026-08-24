import assert from "node:assert/strict";
import test from "node:test";

import { FleetRegistry, BILLING_MODES } from "../../packages/gateway-core/src/fleet-registry.mjs";

const requiredFields = [
  "harness_id", "canonical_name", "vendor", "executable", "installed", "version", "auth_mode",
  "auth_health", "billing_mode", "subscription_reused", "api_key_required", "headless_mode",
  "transport", "capabilities", "current_account_if_safely_exposed", "quota_if_exposed",
  "last_verified_at", "last_error"
];

test("WP01 registry loads normalized H01-H08 without secrets", async () => {
  const registry = new FleetRegistry({ probeCommand: async () => ({ ok: false, reason: "executable_not_found", output: "" }) });
  const fleet = await registry.list();
  assert.deepEqual(fleet.map((item) => item.harness_id), ["H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08"]);
  for (const item of fleet) {
    for (const field of requiredFields) assert.ok(Object.hasOwn(item, field), `${item.harness_id}.${field}`);
    assert.ok(BILLING_MODES.includes(item.billing_mode));
    assert.doesNotMatch(JSON.stringify(item), /(?:api[_-]?key|token|secret)["']?\s*:\s*["'][^"']+/i);
  }
  assert.equal(fleet[0].subscription_reused, true);
  assert.equal(fleet[0].api_key_required, false);
  for (const id of ["H02", "H03", "H04", "H06", "H07", "H08"]) {
    const item = fleet.find((candidate) => candidate.harness_id === id);
    assert.equal(item.auth_mode, "UNKNOWN_REQUIRES_REVIEW");
    assert.equal(item.billing_mode, "UNKNOWN_REQUIRES_REVIEW");
    assert.equal(item.transport, "UNAVAILABLE");
  }
});

test("H01 login-required health is explicit", async () => {
  const adapter = {
    describe: async () => ({ harness_version: "codex-cli" }),
    health: async () => ({ status: "unhealthy", details: { reason: "codex_not_authenticated", version: "codex 1.0" } })
  };
  const registry = new FleetRegistry({ gatewayRegistry: [{ config: { id: "openai.codex.cli" }, adapter }], probeCommand: async () => ({ ok: false }) });
  const h01 = (await registry.list())[0];
  assert.equal(h01.installed, true);
  assert.equal(h01.auth_health, "LOGIN_REQUIRED");
  assert.equal(h01.last_error, "codex_not_authenticated");
});

import test from "node:test";
import assert from "node:assert/strict";
import { authorizeAuditAction, createAuditIdentity, verifyAuditSecret, AUDIT_READONLY_ACTIONS } from "../packages/aquahub-auth/src/audit-readonly.mjs";

test("identity is short-lived and secret is represented by a digest", () => {
  const identity = createAuditIdentity({ now: () => 1000, ttlMs: 60000 });
  assert.equal(identity.role, "AUDIT_READONLY"); assert.equal(identity.expiresAt, 61000); assert.equal(identity.secretDigest.length, 64); assert.notEqual(identity.secret, identity.secretDigest);
  assert.equal(verifyAuditSecret(identity.secret, identity.secretDigest), true);
});
test("only read, login, logout and session verification actions are allowed", () => {
  const identity = createAuditIdentity({ now: () => 1000 });
  for (const action of AUDIT_READONLY_ACTIONS) assert.equal(authorizeAuditAction(identity, action, 1001), true);
  for (const action of ["dispatch", "result:write", "config:write", "tenant:manage", "account:manage", "secret:read", "deploy", "production:operate", "delete"]) assert.equal(authorizeAuditAction(identity, action, 1001), false);
});
test("expired identity and wrong secret fail closed", () => {
  const identity = createAuditIdentity({ now: () => 1000, ttlMs: 1 });
  assert.equal(authorizeAuditAction(identity, "dashboard:read", 1002), false); assert.equal(verifyAuditSecret("wrong", identity.secretDigest), false);
});

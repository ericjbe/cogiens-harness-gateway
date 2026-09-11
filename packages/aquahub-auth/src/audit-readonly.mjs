import { createHash, randomBytes } from "node:crypto";

export const AUDIT_READONLY_ACTIONS = Object.freeze(new Set([
  "login", "dashboard:read", "results:read", "evidence:read", "logout", "session:verify"
]));
export const AUDIT_READONLY_DENIED = Object.freeze(new Set([
  "dispatch", "result:write", "config:write", "tenant:manage", "account:manage",
  "secret:read", "deploy", "production:operate", "customer:manage", "billing:manage", "delete"
]));

export function createAuditIdentity({ ttlMs = 15 * 60_000, now = Date.now } = {}) {
  const secret = randomBytes(32).toString("base64url");
  const secretDigest = createHash("sha256").update(secret).digest("hex");
  return { role: "AUDIT_READONLY", secret, secretDigest, expiresAt: now() + ttlMs, actions: [...AUDIT_READONLY_ACTIONS] };
}

export function authorizeAuditAction(identity, action, now = Date.now()) {
  if (!identity || identity.role !== "AUDIT_READONLY" || identity.expiresAt <= now) return false;
  return AUDIT_READONLY_ACTIONS.has(action) && !AUDIT_READONLY_DENIED.has(action);
}

export function verifyAuditSecret(secret, digest) {
  if (!secret || !digest) return false;
  return createHash("sha256").update(secret).digest("hex") === digest;
}

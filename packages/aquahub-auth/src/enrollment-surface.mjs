import { createHash, randomBytes, randomUUID } from "node:crypto";

const ALLOWED = Object.freeze(["login", "dashboard:read", "results:read", "evidence:read", "logout", "session:verify"]);
const DENIED = Object.freeze(["dispatch", "result:write", "config:write", "tenant:manage", "account:manage", "secret:read", "deploy", "production:operate"]);
const digest = value => createHash("sha256").update(value, "utf8").digest("hex");

export class EnrollmentSurface {
  #requests = new Map(); #clock;
  constructor({ now = () => Date.now() } = {}) { this.#clock = now; }
  create({ founderId, domain = "aquahub.cogiens.com", ttlMs = 15 * 60_000, nonce: suppliedNonce }) {
    const id = `AR-${randomBytes(8).toString("hex").toUpperCase()}`;
    const nonce = suppliedNonce ?? randomBytes(32).toString("base64url");
    const request = { id, founderDigest: digest(founderId), nonceDigest: digest(nonce), domain, createdAt: this.#clock(), expiresAt: this.#clock() + ttlMs, status: "PENDING" };
    this.#requests.set(id, request);
    return { ...request, nonce: undefined };
  }
  view(id, { founderId, recentlyAuthenticated }) {
    const request = this.#requests.get(id); if (!request || request.status !== "PENDING" || request.expiresAt <= this.#clock()) return null;
    if (!recentlyAuthenticated || digest(founderId) !== request.founderDigest) return null;
    return { id: request.id, domain: request.domain, createdAt: request.createdAt, expiresAt: request.expiresAt, status: request.status, allowed: ALLOWED, denied: DENIED };
  }
  decide(id, { founderId, recentlyAuthenticated, csrfValid, nonce, decision }) {
    const request = this.#requests.get(id);
    if (!request || request.status !== "PENDING" || request.expiresAt <= this.#clock()) return { ok: false, code: "EXPIRED_OR_CONSUMED" };
    if (!recentlyAuthenticated || digest(founderId) !== request.founderDigest) return { ok: false, code: "FOUNDER_AUTH_REQUIRED" };
    if (!csrfValid) return { ok: false, code: "CSRF_INVALID" };
    if (!nonce || digest(nonce) !== request.nonceDigest) return { ok: false, code: "NONCE_INVALID" };
    request.status = decision === "approve" ? "APPROVED" : decision === "reject" ? "REJECTED" : "INVALID_DECISION";
    return request.status === "INVALID_DECISION" ? { ok: false, code: "INVALID_DECISION" } : { ok: true, status: request.status };
  }
}

export const enrollmentMarkup = view => `<!doctype html><html><head><meta charset="utf-8"><title>水枢验收身份授权</title></head><body><h1>水枢一次性验收身份授权</h1><dl><dt>身份</dt><dd>ADAPTER_SCOPED_AUDIT_READONLY</dd><dt>授权编号</dt><dd>${view.id}</dd><dt>目标域名</dt><dd>${view.domain}</dd><dt>创建时间</dt><dd>${new Date(view.createdAt).toISOString()}</dd><dt>失效时间</dt><dd>${new Date(view.expiresAt).toISOString()}</dd></dl><h2>允许权限</h2><ul>${view.allowed.map(x => `<li>${x}</li>`).join("")}</ul><h2>明确禁止</h2><ul>${view.denied.map(x => `<li>${x}</li>`).join("")}</ul><form method="post"><input type="hidden" name="decision" value="approve"><button type="submit">批准</button></form><form method="post"><input type="hidden" name="decision" value="reject"><button type="submit">拒绝</button></form></body></html>`;

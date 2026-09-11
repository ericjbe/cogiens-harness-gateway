import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionRevocationStore } from "../packages/aquahub-auth/src/session-revocation.mjs";

const setup = async () => { const dir = await mkdtemp(path.join(os.tmpdir(), "aquahub-revoke-")); let now = 1000; return { file: path.join(dir, "revoked.json"), clock: () => now, advance: n => { now += n; } }; };

test("logout revokes replay and persists across adapter restart", async () => {
  const f = await setup(); const first = new SessionRevocationStore({ file: f.file, now: f.clock });
  await first.revoke("cookie-A", 2000); assert.equal(await first.isRevoked("cookie-A"), true); assert.equal(await first.isRevoked("cookie-B"), false);
  const restarted = new SessionRevocationStore({ file: f.file, now: f.clock }); assert.equal(await restarted.isRevoked("cookie-A"), true);
});
test("expiry cleanup removes stale digests", async () => {
  const f = await setup(); const s = new SessionRevocationStore({ file: f.file, now: f.clock }); await s.revoke("cookie-A", 1100); f.advance(100); assert.equal(await s.isRevoked("cookie-A"), false); const raw = await readFile(f.file, "utf8"); assert.equal(raw.includes("cookie-A"), false); assert.equal(JSON.parse(raw).revoked["cookie-A"], undefined);
});
test("concurrent logout writes are serialized", async () => {
  const f = await setup(); const s = new SessionRevocationStore({ file: f.file, now: f.clock }); await Promise.all([s.revoke("a", 5000), s.revoke("b", 5000), s.revoke("c", 5000)]); assert.equal(await s.isRevoked("a"), true); assert.equal(await s.isRevoked("b"), true); assert.equal(await s.isRevoked("c"), true);
});
test("digest is irreversible storage and logs need no secret", async () => {
  const f = await setup(); const s = new SessionRevocationStore({ file: f.file, now: f.clock }); await s.revoke("sensitive-cookie", 5000); const raw = await readFile(f.file, "utf8"); assert.equal(raw.includes("sensitive-cookie"), false); assert.match(raw, /[a-f0-9]{64}/);
});

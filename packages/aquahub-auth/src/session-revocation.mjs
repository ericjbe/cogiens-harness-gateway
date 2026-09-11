import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** Durable, provider-neutral session revocation store for the Aquahub adapter.
 * Only a SHA-256 digest and expiry are persisted; raw cookies/tokens never are.
 */
export class SessionRevocationStore {
  #file; #clock; #write = Promise.resolve();
  constructor({ file, now = () => Date.now() }) { this.#file = file; this.#clock = now; }
  digest(token) { return createHash("sha256").update(String(token), "utf8").digest("hex"); }
  async #load() {
    try { return JSON.parse(await readFile(this.#file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return { version: 1, revoked: {} }; throw error; }
  }
  async #save(value) {
    await mkdir(path.dirname(this.#file), { recursive: true });
    const temporary = `${this.#file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, this.#file);
  }
  async #locked(operation) {
    const result = this.#write.then(operation, operation);
    this.#write = result.then(() => undefined, () => undefined);
    return result;
  }
  async revoke(token, expiresAt) {
    if (!token || !Number.isFinite(expiresAt)) throw new TypeError("token and finite expiry required");
    return this.#locked(async () => {
      const state = await this.#load();
      const now = this.#clock();
      for (const [key, expiry] of Object.entries(state.revoked)) if (expiry <= now) delete state.revoked[key];
      state.revoked[this.digest(token)] = expiresAt;
      await this.#save(state);
    });
  }
  async isRevoked(token) {
    return this.#locked(async () => {
      const state = await this.#load();
      const now = this.#clock(); let changed = false;
      for (const [key, expiry] of Object.entries(state.revoked)) if (expiry <= now) { delete state.revoked[key]; changed = true; }
      if (changed) await this.#save(state);
      return Number.isFinite(state.revoked[this.digest(token)]) && state.revoked[this.digest(token)] > now;
    });
  }
  async cleanup() { return this.isRevoked(""); }
}

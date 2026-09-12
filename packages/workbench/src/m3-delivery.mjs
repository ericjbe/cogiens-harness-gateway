import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
const sha = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const required = ["job_id", "idempotency_key", "tenant_id", "project_id", "source_origin", "created_at", "payload_sha256", "command_package_sha256", "repository", "immutable_base_commit", "execution_policy", "acceptance_policy", "artifact_policy", "retry_policy", "budget_policy"];
export function createWorkOrder(input) { for (const key of required) if (input[key] === undefined || input[key] === null) throw new Error(`M3_FIELD_REQUIRED:${key}`); if (!/^job_[A-Za-z0-9_-]+$/.test(input.job_id) || !/^idem_[A-Za-z0-9_-]+$/.test(input.idempotency_key)) throw new Error("M3_ID_INVALID"); return Object.freeze({ ...input, schema_version: "shuishu.m3-work-order.v1" }); }
export function durableAccepted(response, order) { if (!response || response.status !== "M3_DURABLE_ACCEPTED" || response.idempotency_key !== order.idempotency_key || response.job_id !== order.job_id || typeof response.accepted_at !== "string") throw new Error("M3_DURABLE_ACK_INVALID"); return response; }
export class M3DeliveryQueue {
  constructor(root, transport) { this.root = path.resolve(root); this.transport = transport; }
  async #write(name, value) { await mkdir(this.root, { recursive: true }); const tmp = path.join(this.root, `${name}.${randomUUID()}.tmp`); await writeFile(tmp, JSON.stringify(value), { mode: 0o600 }); await rename(tmp, path.join(this.root, name)); }
  async deliver(order) { const work = createWorkOrder(order); const key = `${work.idempotency_key}.json`; await this.#write(`pending-${key}`, work); let ack; try { ack = durableAccepted(await this.transport(work), work); } catch (error) { return { status: "WAITING_FOR_M3_CONFIRMATION", idempotency_key: work.idempotency_key, error: error.message }; } await this.#write(`accepted-${key}`, { order: work, ack }); return { status: "M3_DURABLE_ACCEPTED", ...ack }; }
  async recover(idempotencyKey) { return JSON.parse(await readFile(path.join(this.root, `accepted-${idempotencyKey}.json`), "utf8")); }
}
export class EventLedger {
  constructor(file) { this.file = file; }
  async append(jobId, type, payload = {}) { let state = { events: [] }; try { state = JSON.parse(await readFile(this.file, "utf8")); } catch {} const previous = state.events.at(-1); const event = { job_id: jobId, event_sequence: (previous?.event_sequence ?? 0) + 1, type, payload, previous_sha256: previous?.sha256 ?? null }; event.sha256 = sha(event); state.events.push(event); await mkdir(path.dirname(this.file), { recursive: true }); await writeFile(this.file, JSON.stringify(state), { mode: 0o600 }); return event; }
  async verify() { const state = JSON.parse(await readFile(this.file, "utf8")); let previous = null; for (let i = 0; i < state.events.length; i++) { const event = state.events[i]; if (event.event_sequence !== i + 1 || event.previous_sha256 !== previous) throw new Error("EVENT_SEQUENCE_INVALID"); const expected = sha({ job_id: event.job_id, event_sequence: event.event_sequence, type: event.type, payload: event.payload, previous_sha256: event.previous_sha256 }); if (event.sha256 !== expected) throw new Error("EVENT_HASH_INVALID"); previous = event.sha256; } return true; }
}

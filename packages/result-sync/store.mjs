import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { authenticate, digest, fail, validateEnvelope } from './protocol.mjs';

export async function atomicJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temp = `${filename}.${randomUUID()}.tmp`;
  const { open } = await import('node:fs/promises');
  const file = await open(temp, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
  await rename(temp, filename);
}
export class ResultStore {
  constructor(directory, identities) { this.filename = path.join(directory, 'results.json'); this.identities = identities; this.serial = Promise.resolve(); }
  async initialize() {
    try { this.state = JSON.parse(await readFile(this.filename, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; this.state = { schema_version: 1, nodes: {}, records: {}, receipts: {} }; }
    return this;
  }
  ingest(headers, body, now = Date.now()) {
    const next = this.serial.then(() => this.apply(headers, body, now));
    this.serial = next.catch(() => {}); return next;
  }
  async apply(headers, body, now) {
    if (Buffer.byteLength(body) > 1024 * 1024) fail('TOO_LARGE', 413);
    const auth = authenticate(headers, body, this.identities, now);
    let envelope; try { envelope = JSON.parse(body); } catch { fail('INVALID_JSON'); }
    validateEnvelope(envelope);
    if (envelope.node_id !== auth.node_id) fail('NODE_SCOPE_DENIED', 403);
    const bodyHash = digest(body), nonceKey = `${auth.name}:${auth.nonce}`;
    if (this.state.receipts[nonceKey]) {
      if (this.state.receipts[nonceKey].hash !== bodyHash) fail('NONCE_CONFLICT', 409);
      return { accepted: envelope.records.length, duplicate: true, sha256: bodyHash };
    }
    const next = structuredClone(this.state);
    let changed = 0;
    for (const record of envelope.records) {
      const key = `${envelope.node_id}:${record.job_id}`, previous = next.records[key];
      if (previous && digest(JSON.stringify(previous.record)) === digest(JSON.stringify(record))) continue;
      if (previous && record.updated_at <= previous.record.updated_at) fail('RESULT_VERSION_CONFLICT', 409);
      if (previous && previous.record.status !== 'RUNNING') fail('TERMINAL_RESULT_IMMUTABLE', 409);
      next.records[key] = { node_id: envelope.node_id, received_at: new Date(now).toISOString(), record };
      changed++;
    }
    next.nodes[envelope.node_id] = { node_id: envelope.node_id, last_heartbeat: new Date(now).toISOString() };
    next.receipts[nonceKey] = { hash: bodyHash, timestamp: Number(auth.timestamp) };
    for (const [key, value] of Object.entries(next.receipts)) if (value.timestamp < now - 600000) delete next.receipts[key];
    await atomicJson(this.filename, next); this.state = next;
    return { accepted: envelope.records.length, changed, duplicate: changed === 0, sha256: bodyHash };
  }
  summary() {
    return { sync_status: Object.keys(this.state.nodes).length ? 'SYNCED' : 'NOT_SYNCED', nodes: Object.values(this.state.nodes), jobs: Object.values(this.state.records).map(({node_id,record,received_at}) => ({ ...record, node_id, received_at, artifacts: [this.artifactIndex(node_id, record)] })) };
  }
  artifactIndex(node, record) {
    const body = this.artifactBody(record);
    return { name: 'approved-result.json', kind: 'sanitized-result-evidence', bytes: Buffer.byteLength(body), sha256: digest(body), download_url: `/v1/result-sync/evidence/${node}/${record.job_id}` };
  }
  artifactBody(record) { return JSON.stringify({ schema_version: 'shuishu.approved-result-evidence.v1', ...record }, null, 2) + '\n'; }
  evidence(node, job) { const item = this.state.records[`${node}:${job}`]; return item ? this.artifactBody(item.record) : null; }
}

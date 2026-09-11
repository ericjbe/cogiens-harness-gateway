import { createHash, createPublicKey, verify } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const statuses = ['RUNNING', 'REJECTED', 'READY_FOR_REVIEW', 'DEPLOYED'];
export function fail(code, status = 400) { throw Object.assign(new Error(code), { status }); }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('INVALID_FIELDS');
}
function id(value) { if (typeof value !== 'string' || !identifier.test(value)) fail('INVALID_ID'); }
function date(value) { if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail('INVALID_TIME'); }
function count(value) { if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_COUNT'); }
export function validateRecord(r) {
  exact(r, ['job_id','parent_job_id','root_job_id','run_id','trace_id','correlation_origin','status','updated_at','tests','stages','summary_code','source_sha256']);
  for (const key of ['job_id','root_job_id','run_id','trace_id']) id(r[key]);
  if (r.parent_job_id !== null) id(r.parent_job_id);
  if (r.correlation_origin !== 'runner-sync-derived-v1' || !statuses.includes(r.status)) fail('INVALID_STATUS');
  if (!['RECOVERY_COMPLETE','PAYLOAD_GATE_REJECTED','STAGE_RESULT'].includes(r.summary_code)) fail('INVALID_SUMMARY');
  date(r.updated_at);
  if (!/^[a-f0-9]{64}$/.test(r.source_sha256)) fail('INVALID_HASH');
  if (r.tests !== null) {
    exact(r.tests, ['total','passed','failed','scope']);
    for (const key of ['total','passed','failed']) count(r.tests[key]);
    if (r.tests.passed + r.tests.failed > r.tests.total || r.tests.scope !== 'full-verify') fail('INVALID_TESTS');
  }
  if (!Array.isArray(r.stages) || r.stages.length !== 7) fail('INVALID_STAGES');
  r.stages.forEach((s, i) => {
    exact(s, ['number','status','inherited_from']);
    if (s.number !== i + 1 || !['SUCCEEDED','FAILED','RUNNING','NOT_RUN'].includes(s.status)) fail('INVALID_STAGE');
    if (s.inherited_from !== null) id(s.inherited_from);
  });
  if (r.status === 'READY_FOR_REVIEW' && (!r.tests || r.tests.failed || r.tests.passed < 65 || r.stages.some(s => s.status !== 'SUCCEEDED'))) fail('UNSUPPORTED_READY');
  // No free-form strings, source, remote paths, URLs or caller-chosen artifacts cross this boundary.
  return r;
}
export function validateEnvelope(e) {
  exact(e, ['schema_version','node_id','sent_at','records']);
  if (e.schema_version !== 'shuishu.result-sync.v1') fail('INVALID_SCHEMA');
  id(e.node_id); date(e.sent_at);
  if (!Array.isArray(e.records) || e.records.length > 100) fail('INVALID_RECORDS');
  e.records.forEach(validateRecord);
  if (new Set(e.records.map(r => r.job_id)).size !== e.records.length) fail('DUPLICATE_RECORD');
  return e;
}
export const signingInput = (timestamp, nonce, body) => Buffer.from(`shuishu.result-sync.v1\n${timestamp}\n${nonce}\n${digest(body)}`);
export function authenticate(headers, body, identities, now = Date.now()) {
  const name = headers['x-shuishu-identity'];
  const identity = identities[name];
  if (!identity || !identity.scopes?.includes('results:write')) fail('SERVICE_AUTH_REQUIRED', 401);
  const timestamp = headers['x-shuishu-timestamp'];
  const nonce = headers['x-shuishu-nonce'];
  if (!/^\d{13}$/.test(timestamp ?? '') || Math.abs(now - Number(timestamp)) > 300000 || !/^[a-f0-9]{32}$/.test(nonce ?? '')) fail('SERVICE_AUTH_EXPIRED', 401);
  const signature = headers['x-shuishu-signature'];
  if (!/^[A-Za-z0-9_-]{86}$/.test(signature ?? '')) fail('SERVICE_AUTH_REQUIRED', 401);
  let valid = false;
  try { valid = verify('sha256', signingInput(timestamp, nonce, body), { key: createPublicKey({ key: identity.public_jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')); } catch {}
  if (!valid) fail('SERVICE_AUTH_REQUIRED', 401);
  return { name, node_id: identity.node_id, nonce, timestamp };
}

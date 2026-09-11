import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { digest, identifier, validateRecord } from './protocol.mjs';

async function confinedRead(root, relative) {
  const base = await realpath(root);
  let cursor = base;
  for (const part of relative.split('/')) {
    if (!part || part === '..' || part === '.' || part.includes('\\')) throw new Error('SOURCE_BOUNDARY');
    cursor = path.join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('SOURCE_LINK_DENIED');
  }
  const resolved = await realpath(cursor), rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('SOURCE_BOUNDARY');
  if ((await lstat(resolved)).size > 8 * 1024 * 1024) throw new Error('SOURCE_TOO_LARGE');
  return readFile(resolved);
}
export async function collectRunnerResults({ spool_root, job_ids }) {
  if (!Array.isArray(job_ids) || job_ids.some(id => !identifier.test(id))) throw new Error('INVALID_SOURCE_IDS');
  const sources = new Map();
  for (const id of job_ids) {
    const bytes = await confinedRead(spool_root, `outbox/${id}.result.json`);
    const source = JSON.parse(bytes);
    if (source.job_id !== id || source.schema_version !== 'shuishu.runner-result.v1') throw new Error('SOURCE_IDENTITY_MISMATCH');
    sources.set(id, { source, hash: digest(bytes) });
  }
  return [...sources].map(([id, {source, hash}]) => {
    const workflow = source.stage_state?.schema_version === 'shuishu.automatic-recovery-state.v1';
    const finalId = workflow ? source.stage_state.attempts?.at(-1)?.job_id : null;
    const final = finalId ? sources.get(finalId)?.source : null;
    if (workflow && (!final || final.status !== source.status)) throw new Error('MISSING_FINAL_ATTEMPT');
    const tests = (final ?? source).tests;
    const stageSource = (final ?? source).stage_state?.stages ?? {};
    const root = source.root_job_id ?? id;
    const r = {
      job_id: id, parent_job_id: source.parent_job_id ?? source.stage_state?.source_job_id ?? null,
      root_job_id: root, run_id: `run_${digest(id).slice(0,32)}`, trace_id: `trace_${digest(root).slice(0,32)}`,
      correlation_origin: 'runner-sync-derived-v1', status: source.status,
      updated_at: source.completed_at, source_sha256: hash,
      tests: tests ? { total: tests.tests, passed: tests.pass, failed: tests.fail, scope: 'full-verify' } : null,
      summary_code: workflow ? 'RECOVERY_COMPLETE' : source.status === 'REJECTED' && source.stage_state?.current_stage?.startsWith('04-') ? 'PAYLOAD_GATE_REJECTED' : 'STAGE_RESULT',
      stages: Array.from({length:7}, (_, i) => {
        const entries = Object.entries(stageSource).filter(([key]) => key.startsWith(`${String(i+1).padStart(2,'0')}-`));
        if (entries.length > 1) throw new Error('AMBIGUOUS_STAGE');
        return { number: i + 1, status: entries[0]?.[1].status ?? 'NOT_RUN', inherited_from: finalId };
      })
    };
    return validateRecord(r);
  });
}

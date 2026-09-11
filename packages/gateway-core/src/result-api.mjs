import { sha256Text } from '../../adapter-sdk/src/index.mjs';

// Caller must perform the same authentication/authorization as job lookup.
export function resolveResult(runtime, pathname) {
  const match = pathname.match(/^\/v1\/jobs\/(job_[A-Za-z0-9_-]+)\/(report|artifacts)(?:\/(art_[A-Za-z0-9_-]+))?$/);
  if (!match) return null;
  const [, jobId, resource, artifactId] = match;
  if (resource === 'report' && artifactId) return {status:404, error:'Result route not found'};
  const job = runtime.getJob(jobId);
  if (!job) return {status:404, error:'Job not found'};
  if (resource === 'report') {
    const lines = ['# ' + (job.task_title ?? job.job_id), '任务：' + job.job_id, '状态：' + job.gateway_status, '业务验收：' + job.status, '工作目录：' + job.workspace, ''];
    for (const run of job.runs ?? []) {
      lines.push('## ' + run.adapter_id + ' · ' + run.state);
      const error = run.error ?? [...(run.events ?? [])].reverse().find(e=>e.payload?.error)?.payload.error;
      if (error) lines.push('错误：' + error.code + '\n' + error.message);
      for (const event of run.events ?? []) if (event.type === 'assistant.message.completed') lines.push(String(event.payload?.message ?? ''));
      lines.push('登记产物数：' + (run.artifacts?.length ?? 0), '');
    }
    return {status:200, filename:jobId+'.txt', body:lines.join('\n\n')};
  }
  const artifacts = (job.runs ?? []).flatMap(run => (run.artifacts ?? []).map(a=>({...a, run_id:run.run_id})));
  if (!artifactId) return {status:200, json:{artifacts:artifacts.map(({content,...a})=>({...a, inline:typeof content==='string', download_path:typeof content==='string' ? '/v1/jobs/'+jobId+'/artifacts/'+a.artifact_id : null}))}};
  const artifact = artifacts.find(a=>a.artifact_id===artifactId);
  if (!artifact) return {status:404,error:'Artifact not found in this job'};
  if (typeof artifact.content !== 'string') return {status:409,error:'Artifact content is not inline; use the existing file service'};
  return {status:200,filename:artifactId+(artifact.media_type==='text/markdown'?'.md':'.txt'),body:artifact.content,sha256:sha256Text(artifact.content)};
}

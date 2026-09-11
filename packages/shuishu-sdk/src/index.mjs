// Use behind the existing APP/CP service. Global Gateway credentials must not be shipped to customers.
export function createShuishuClient({ baseUrl, fetchImpl = globalThis.fetch, getHeaders = async () => ({}), timeoutMs = 15000 }) {
  const base = new URL(baseUrl);
  if (!['http:','https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid Gateway base URL');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation required');
  const root = base.href.replace(/\/$/,'');
  async function request(route, options = {}, text = false) {
    const headers = new Headers(await getHeaders());
    if (options.body) headers.set('content-type','application/json');
    const response = await fetchImpl(root+route,{...options,headers,signal:AbortSignal.timeout(timeoutMs)});
    if (!response.ok) {
      let payload; try { payload=await response.json(); } catch {}
      const error = new Error(payload?.error?.message ?? 'Gateway HTTP '+response.status);
      error.status=response.status;error.code=payload?.error?.code ?? 'GATEWAY_ERROR';throw error;
    }
    return text ? response.text() : response.json();
  }
  const id = encodeURIComponent;
  return Object.freeze({
    health:()=>request('/health'),
    capabilities:()=>request('/v1/platform'),
    adapters:()=>request('/v1/adapters'),
    modelCatalog:()=>request('/v1/model-harness/catalog'),
    submitSelected:input=>request('/v1/jobs/selected',{method:'POST',body:JSON.stringify(input)}),
    listJobs:(limit=50)=>request('/v1/jobs?limit='+id(limit)),
    getJob:job=>request('/v1/jobs/'+id(job)),
    submit:input=>request('/v1/jobs/fanout',{method:'POST',body:JSON.stringify(input)}),
    cancel:(job,reason='host-user')=>request('/v1/jobs/'+id(job)+'/cancel',{method:'POST',body:JSON.stringify({reason})}),
    artifacts:job=>request('/v1/jobs/'+id(job)+'/artifacts'),
    downloadArtifact:(job,artifact)=>request('/v1/jobs/'+id(job)+'/artifacts/'+id(artifact),{},true),
    report:job=>request('/v1/jobs/'+id(job)+'/report',{},true)
  });
}

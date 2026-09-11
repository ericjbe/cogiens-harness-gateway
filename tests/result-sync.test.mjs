import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { ResultStore } from '../packages/result-sync/store.mjs';
import { DurableSender } from '../packages/result-sync/sender.mjs';
import { signingInput, digest, validateRecord } from '../packages/result-sync/protocol.mjs';
import { collectRunnerResults } from '../packages/result-sync/runner-source.mjs';
import { ingestRequest, evidenceResponse } from '../packages/result-sync/http.mjs';

const record = () => ({job_id:'job_test_a2',parent_job_id:'job_test_a1',root_job_id:'job_test',run_id:'run_test',trace_id:'trace_test',correlation_origin:'runner-sync-derived-v1',status:'READY_FOR_REVIEW',updated_at:'2026-09-11T12:10:00.000Z',tests:{total:65,passed:65,failed:0,scope:'full-verify'},stages:Array.from({length:7},(_,i)=>({number:i+1,status:'SUCCEEDED',inherited_from:null})),summary_code:'STAGE_RESULT',source_sha256:'a'.repeat(64)});
const envelope = (records=[record()]) => ({schema_version:'shuishu.result-sync.v1',node_id:'test-node',sent_at:new Date().toISOString(),records});
async function fixture() {
  const directory=await mkdtemp(path.join(os.tmpdir(),'result-sync-'));
  const keys=generateKeyPairSync('ec',{namedCurve:'P-256'});
  const identities={'test-identity':{node_id:'test-node',scopes:['results:write'],public_jwk:keys.publicKey.export({format:'jwk'})}};
  const signer = input=>sign('sha256',input,{key:keys.privateKey,dsaEncoding:'ieee-p1363'});
  const headers=body=>{const timestamp=String(Date.now()),nonce=randomBytes(16).toString('hex');return {'x-shuishu-identity':'test-identity','x-shuishu-timestamp':timestamp,'x-shuishu-nonce':nonce,'x-shuishu-signature':signer(signingInput(timestamp,nonce,body)).toString('base64url')};};
  const store=await new ResultStore(directory,identities).initialize();
  return {directory,identities,signer,headers,store};
}
test('result sync persists real status distinctions and content-addressed approved evidence',async()=>{
  const f=await fixture(), rejected=record(); rejected.job_id='job_test_a1'; rejected.status='REJECTED'; rejected.stages[3].status='FAILED';
  const payload=JSON.stringify(envelope([rejected,record()])); await f.store.ingest(f.headers(payload),payload);
  const restored=await new ResultStore(f.directory,f.identities).initialize();
  assert.equal(restored.summary().jobs.length,2); assert.equal(restored.summary().jobs[0].status,'REJECTED');
  const artifact=restored.summary().jobs[1].artifacts[0], body=restored.evidence('test-node','job_test_a2');
  assert.equal(artifact.sha256,digest(body)); assert.equal(artifact.bytes,Buffer.byteLength(body));
});
test('concurrent retries and restart produce exactly one job',async()=>{
  const f=await fixture(), body=JSON.stringify(envelope());
  await Promise.all(Array.from({length:8},()=>f.store.ingest(f.headers(body),body)));
  const restored=await new ResultStore(f.directory,f.identities).initialize();
  await restored.ingest(f.headers(body),body); assert.equal(restored.summary().jobs.length,1);
});
test('anonymous and invalid signatures are rejected without writes',async()=>{
  const f=await fixture(), body=JSON.stringify(envelope());
  await assert.rejects(f.store.ingest({},body),{status:401});
  const headers=f.headers(body);headers['x-shuishu-signature']='A'.repeat(86);
  await assert.rejects(f.store.ingest(headers,body),{status:401});assert.equal(f.store.summary().sync_status,'NOT_SYNCED');
});
test('service identity cannot write another node or exceed its scope',async()=>{
  const f=await fixture(), e=envelope();e.node_id='other-node';let body=JSON.stringify(e);
  await assert.rejects(f.store.ingest(f.headers(body),body),{status:403});
  f.identities['test-identity'].scopes=[];body=JSON.stringify(envelope());
  await assert.rejects(f.store.ingest(f.headers(body),body),{status:401});
});
test('expired authentication and changed body replay fail closed',async()=>{
  const f=await fixture(),body=JSON.stringify(envelope()),headers=f.headers(body);
  await assert.rejects(f.store.ingest(headers,body,Date.now()+400000),{status:401});
  await assert.rejects(f.store.ingest(headers,body+' '),{status:401});
});
test('terminal result evidence is immutable',async()=>{
  const f=await fixture();let body=JSON.stringify(envelope());await f.store.ingest(f.headers(body),body);
  const r=record();r.updated_at='2026-09-12T12:10:00.000Z';r.status='DEPLOYED';body=JSON.stringify(envelope([r]));
  await assert.rejects(f.store.ingest(f.headers(body),body),{status:409});assert.equal(f.store.summary().jobs[0].status,'READY_FOR_REVIEW');
});
test('unknown fields, arbitrary paths and false readiness cannot enter the store',()=>{
  for(const field of ['source','cookie','password','download_url','internal_path']) assert.throws(()=>validateRecord({...record(),[field]:'blocked'}));
  assert.throws(()=>validateRecord({...record(),job_id:'../outside'}));
  const r=record();r.stages[3].status='FAILED';assert.throws(()=>validateRecord(r));
});
test('offline queue survives restart, retries automatically, and verifies receipts',async()=>{
  const f=await fixture();let online=false;
  const options={directory:path.join(f.directory,'queue'),endpoint:'https://example.invalid/v1/result-sync/ingest',identity:'test-identity',sign:f.signer,transport:async(url,request)=>{
    assert.equal(request.redirect,'error');if(!online)throw new Error('offline');
    const receipt=await f.store.ingest(request.headers,request.body);return {ok:true,json:async()=>receipt};
  }};
  const sender=new DurableSender(options);await sender.enqueue(envelope());await assert.rejects(sender.flush());
  assert.equal((await readdir(path.join(options.directory,'pending'))).length,1);
  online=true;assert.equal((await new DurableSender(options).flush()).delivered,1);
  assert.equal((await readdir(path.join(options.directory,'pending'))).length,0);assert.equal(f.store.summary().jobs.length,1);
});
test('sender refuses plaintext endpoints and unverified delivery receipts',async()=>{
  const f=await fixture();assert.throws(()=>new DurableSender({endpoint:'http://example.invalid'}));
  const sender=new DurableSender({directory:path.join(f.directory,'queue'),endpoint:'https://example.invalid',identity:'test-identity',sign:f.signer,transport:async()=>({ok:true,json:async()=>({sha256:'wrong'})})});
  await sender.enqueue(envelope());await assert.rejects(sender.flush(),/INVALID_RECEIPT/);
  assert.equal((await readdir(path.join(f.directory,'queue','pending'))).length,1);
});
test('runner adapter selects fields only and rejects traversal and symlink sources',async()=>{
  const f=await fixture();await mkdir(path.join(f.directory,'outbox'));
  const source={schema_version:'shuishu.runner-result.v1',job_id:'job_actual',status:'REJECTED',completed_at:'2026-09-11T12:10:00.000Z',tests:{tests:65,pass:65,fail:0},output:['private data excluded'],evidence:'private path excluded',stage_state:{stages:{'04-manifest':{status:'FAILED',error:'private diagnostic excluded'}},current_stage:'04-manifest'}};
  await writeFile(path.join(f.directory,'outbox','job_actual.result.json'),JSON.stringify(source));
  const results=await collectRunnerResults({spool_root:f.directory,job_ids:['job_actual']});
  assert.equal(results[0].status,'REJECTED');assert.equal(results[0].tests.passed,65);assert.doesNotMatch(JSON.stringify(results),/private/);
  await assert.rejects(collectRunnerResults({spool_root:f.directory,job_ids:['../outside']}));
  if(process.platform!=='win32') {await symlink(path.join(f.directory,'outbox','job_actual.result.json'),path.join(f.directory,'outbox','job_link.result.json'));await assert.rejects(collectRunnerResults({spool_root:f.directory,job_ids:['job_link']}),/SOURCE_LINK_DENIED/);}
});
test('HTTP integration rejects anonymous writes and returns only generated evidence',async t=>{
  const f=await fixture();const server=http.createServer((req,res)=>{
    if(req.method==='POST')return ingestRequest(f.store,req,res);
    if(evidenceResponse(f.store,req.url,res))return;res.writeHead(404);res.end();
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`,body=JSON.stringify(envelope());
  assert.equal((await fetch(base,{method:'POST',body})).status,401);
  assert.equal((await fetch(base,{method:'POST',headers:f.headers(body),body})).status,200);
  const response=await fetch(base+'/v1/result-sync/evidence/test-node/job_test_a2');assert.equal(response.status,200);assert.equal(response.headers.get('x-content-sha256'),digest(await response.text()));
  assert.equal((await fetch(base+'/v1/result-sync/evidence/test-node/config')).status,404);
});

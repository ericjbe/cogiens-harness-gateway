import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTextArtifact, sha256Text } from '../packages/adapter-sdk/src/index.mjs';
import { resolveResult } from '../packages/gateway-core/src/result-api.mjs';
import { loadPluginAdapter } from '../packages/gateway-core/src/plugin-loader.mjs';
import { createShuishuClient } from '../packages/shuishu-sdk/src/index.mjs';
import { createOllamaLocalAdapter } from '../adapters/ollama-local/src/index.mjs';
import { pathToFileURL } from 'node:url';

const binding={job_id:'job_test',run_id:'run_test',trace_id:'trc_test'};
test('artifact hash and length match redacted delivered bytes',()=>{
 const a=createTextArtifact(binding,{content:'中文 '+['s','k-','abcdefghijklmnopqrstuvwxyz'].join('')});
 assert.ok(!a.content.includes('sk-'));assert.equal(a.sha256,sha256Text(a.content));assert.equal(a.size_bytes,Buffer.byteLength(a.content));
});
test('result routes constrain artifact to job and do not fetch file URIs',()=>{
 const runtime={getJob:id=>id==='job_test'?{...binding,runs:[{artifacts:[{artifact_id:'art_ok',content:'中文结果',media_type:'text/markdown'},{artifact_id:'art_file',uri:'file:///etc/passwd'}]}]}:null};
 assert.equal(resolveResult(runtime,'/v1/jobs/job_test/artifacts/art_ok').body,'中文结果');
 assert.equal(resolveResult(runtime,'/v1/jobs/job_other/artifacts/art_ok').status,404);
 assert.equal(resolveResult(runtime,'/v1/jobs/job_test/artifacts/art_other').status,404);
 assert.equal(resolveResult(runtime,'/v1/jobs/job_test/artifacts/art_file').status,409);
 assert.equal(resolveResult(runtime,'/v1/jobs/job_test/artifacts').json.artifacts[1].download_path,null);
});
test('SDK calls existing API with injected credentials and preserves error',async()=>{
 const calls=[];
 const client=createShuishuClient({baseUrl:'http://localhost',getHeaders:async()=>({authorization:'Bearer test'}),fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({error:{code:'NOT_FOUND',message:'missing'}}),{status:404})}});
 await assert.rejects(client.getJob('job_test'),error=>error.code==='NOT_FOUND'&&error.status===404);
 assert.equal(calls[0].url,'http://localhost/v1/jobs/job_test');assert.equal(calls[0].options.headers.get('authorization'),'Bearer test');
});
test('trusted plugin checks root, digest and contract before returning adapter',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'ss-plugin-'));
 try {
 const sdk=new URL('../adapters/ollama-local/src/index.mjs',import.meta.url).href;
 const code=`import {createOllamaLocalAdapter} from ${JSON.stringify(sdk)}; export const createAdapter=createOllamaLocalAdapter;`;
 await writeFile(path.join(root,'plugin.mjs'),code);
 const entry={id:'example',model:'test',module:'plugin.mjs',module_sha256:sha256Text(code),plugin_version:'1',license:'test',owner:'test'};
 const adapter=await loadPluginAdapter(entry,{plugin_root:root});assert.equal((await adapter.describe()).adapter_id,'example');
 await assert.rejects(loadPluginAdapter({...entry,module_sha256:'0'.repeat(64)},{plugin_root:root}),/hash mismatch/);
 await assert.rejects(loadPluginAdapter({...entry,module:path.join(root,'plugin.mjs')},{plugin_root:root}),/relative/);
 }finally{await rm(root,{recursive:true,force:true});}
});
async function localRun(fetchImpl,policy={}) {
 const original=globalThis.fetch;globalThis.fetch=fetchImpl;
 try {
 const a=createOllamaLocalAdapter({id:'test',model:'test',request_timeout_ms:1000});
 const uri=pathToFileURL(os.tmpdir()).href;
 const session=await a.createSession({}, {...binding,project_id:'test',workspace:{uri,write_roots:[uri]},policy:{max_runtime_seconds:1,max_output_bytes:1024,...policy}});
 const events=[];for await (const e of a.startRun({},session,{prompt:{text:'test'}})) events.push(e);
 return events;
 }finally{globalThis.fetch=original;}
}
test('local HTTP crash retains actionable error',async()=>{
 const events=await localRun(async()=>new Response('invalid codepoint',{status:500}));
 assert.equal(events.at(-1).type,'run.failed');assert.match(events.at(-1).payload.error.message,/invalid codepoint/);
});
test('local oversized response is bounded',async()=>{
 const events=await localRun(async()=>new Response(JSON.stringify({response:'x'.repeat(2000)})));
 assert.equal(events.at(-1).payload.error.code,'POLICY_DENIED');
});
test('local timeout is timed_out not user cancellation',async()=>{
 const keepAlive=setInterval(()=>{},100);
 try {
 const events=await localRun(async(url,options)=>new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});}));
 assert.equal(events.at(-1).type,'run.timed_out');
 }finally{clearInterval(keepAlive);}
});

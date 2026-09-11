import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShuishuClient } from '../packages/shuishu-sdk/src/index.mjs';

test('real HTTP Gateway: auth, SDK submit, durable result, report and scoped artifact download', {timeout:15000}, async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'ss-http-'));
 const model=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url==='/api/tags'?{models:[{name:'test:latest'}]}:{response:'中文产物\nTEST_OK'}));});
 let gateway;
 try {
 model.listen(0,'127.0.0.1');await once(model,'listening');
 const config=path.join(root,'config.json'),federation=path.join(root,'federation.json');
 await writeFile(config,JSON.stringify({server:{host:'127.0.0.1',port:0},adapters:[{id:'cogiens.h01.local',kind:'ollama-local',enabled:true,model:'test',base_url:'http://127.0.0.1:'+model.address().port}]}));
 await writeFile(federation,JSON.stringify({schema_version:'0.3.0-alpha.1',runtime_implemented:true,required_evidence:['test'],harnesses:Array.from({length:8},(_,i)=>({harness_id:'H0'+(i+1),canonical_name:'test'+i,support_status:'DECLARED_UNVERIFIED',local_deployment_status:'NOT_PROBED'}))}));
 gateway=spawn(process.execPath,[fileURLToPath(new URL('../apps/gateway/src/server.mjs',import.meta.url))],{env:{...process.env,CHG_CONFIG:config,CHG_FEDERATION_REGISTRY:federation,CHG_DATA_ROOT:path.join(root,'var'),CHG_API_TOKEN:'test-internal-token',CHG_PORT:'0'}});
 const baseUrl=await new Promise((resolve,reject)=>{let output='';gateway.stdout.on('data',data=>{output+=data;const match=output.match(/listening on (http:\/\/[^\s]+)/);if(match)resolve(match[1]);});gateway.on('exit',code=>reject(new Error('Gateway exited '+code)));gateway.stderr.on('data',data=>reject(new Error(String(data))));});
 assert.equal((await fetch(baseUrl+'/v1/platform')).status,401);
 const sdk=createShuishuClient({baseUrl,getHeaders:async()=>({authorization:'Bearer test-internal-token'})});
 assert.equal((await sdk.capabilities()).version,'0.3.0-alpha.3');
 const catalog=await sdk.modelCatalog();
 assert.equal(catalog.choices[0].model,'test');
 assert.equal(catalog.choices[0].verification,'UNVERIFIED');
 assert.equal((await fetch(baseUrl+'/v1/model-harness/catalog')).status,401);
 assert.equal((await fetch(baseUrl+'/v1/jobs/selected',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
 await assert.rejects(sdk.submitSelected({project_id:'test',workspace:root,prompt:'test'}),e=>e.status===400);
 await assert.rejects(sdk.submitSelected({workspace:root,prompt:'test',model_choices:['cogiens.h01.local'],model:'forged'}),e=>e.status===400);
 const created=await sdk.submitSelected({project_id:'test',workspace:root,prompt:'test',model_choices:['cogiens.h01.local']});
 assert.equal(created.model_selection.choices[0].model,'test');
 let job;
 for(let i=0;i<100;i++){job=await sdk.getJob(created.job_id);if(job.gateway_status!=='RUNNING')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(job.gateway_status,'COMPLETED');
 assert.equal(job.model_selection.choices[0].choice_id,'cogiens.h01.local');
 const persisted=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(root,'var','jobs',job.job_id+'.json'),'utf8'));
 assert.equal(persisted.model_selection.choices[0].model,'test');
 const artifact=(await sdk.artifacts(job.job_id)).artifacts[0];assert.equal(artifact.inline,true);
 assert.equal(await sdk.downloadArtifact(job.job_id,artifact.artifact_id),'中文产物\nTEST_OK');
 assert.match(await sdk.report(job.job_id),/TEST_OK/);
 assert.equal((await fetch(baseUrl+'/v1/jobs/'+job.job_id+'/artifacts/'+artifact.artifact_id)).status,401);
 await assert.rejects(sdk.downloadArtifact('job_other',artifact.artifact_id),e=>e.status===404);
 } finally {
 if(gateway && gateway.exitCode===null){const exited=once(gateway,'exit');gateway.kill();await exited;}
 model.closeAllConnections();await new Promise(resolve=>model.close(resolve));await rm(root,{recursive:true,force:true});
 }
});

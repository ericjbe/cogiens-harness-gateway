import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { GatewayRuntime } from '../packages/gateway-core/src/runtime.mjs';
const failure = { code: 'HARNESS_CRASHED', message: 'invalid codepoint' };
test('historical event error is exposed without mutating historical file', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), 'shuishu-'));
 try {
 await mkdir(path.join(root,'jobs'));
 const job = { job_id:'job_test', gateway_status:'FAILED', runs:[{state:'FAILED',error:null,events:[{payload:{error:failure}}],artifacts:[]}] };
 const file = path.join(root,'jobs','job_test.json'); await writeFile(file,JSON.stringify(job));
 const runtime = await new GatewayRuntime({ config:{},registry:[],dataRoot:root }).initialize();
 assert.deepEqual(runtime.getJob('job_test').runs[0].error,failure);
 assert.equal(JSON.parse(await readFile(file)).runs[0].error,null);
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('new failed terminal event persists top-level error', async () => {
 const root = await mkdtemp(path.join(os.tmpdir(),'shuishu-'));
 try {
 const adapter = {health:async()=>({status:'healthy'}),createSession:async()=>({native_session_id:'test'}),async *startRun(){yield {type:'run.failed',payload:{error:failure}};},async *collectArtifacts(){},close:async()=>{}};
 const runtime=await new GatewayRuntime({config:{server:{max_concurrency:1}},registry:[{config:{id:'h01',enabled:true},adapter}],dataRoot:root}).initialize();
 const job=await runtime.submitFanout({prompt:'test',workspace:root,adapters:['h01']});
 for(let i=0;i<100 && runtime.getJob(job.job_id).gateway_status==='RUNNING';i++) await new Promise(r=>setTimeout(r,10));
 assert.equal(runtime.getJob(job.job_id).gateway_status,'FAILED');
 assert.deepEqual(runtime.getJob(job.job_id).runs[0].error,failure);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('details displays legacy errors, safe text and exact downloadable artifact',async()=>{
 const elements=[]; const downloads=[];
 function element(tag){const e={tag,children:[],listeners:{},appendChild(n){this.children.push(n);},addEventListener(k,v){this.listeners[k]=v;},remove(){},click(){downloads.push(this);},showModal(){this.open=true;},close(){},classList:{remove(){},add(){}}};elements.push(e);return e;}
 const doc={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],documentElement:element('html'),body:element('body'),createElement:element};
 const content='<script>alert(1)</script>\n中文输出';
 const job={job_id:'job_test',runs:[{adapter_id:'cogiens.h01.local',state:'FAILED',events:[{payload:{error:failure}}],artifacts:[]},{adapter_id:'cogiens.h07.local',state:'SUCCEEDED',events:[],artifacts:[{artifact_id:'art_test',media_type:'text/markdown',content}]}]};
 let blob;
 const ctx=vm.createContext({document:doc,sessionStorage:{getItem:()=>''},location:{origin:'http://localhost'},MutationObserver:class{observe(){}},setTimeout:()=>{},setInterval:()=>{},Headers,Blob,URL:{createObjectURL(b){blob=b;return 'blob:test'},revokeObjectURL(){}},fetch:async()=>({ok:true,json:async()=>job})});
 await vm.runInContext(await readFile(new URL('../apps/dashboard/dashboard.js',import.meta.url),'utf8'),ctx);
 await vm.runInContext("openJobDetails('job_test')",ctx);
 assert.ok(elements.some(e=>e.tag==='pre'&&e.textContent.includes('invalid codepoint')));
 assert.ok(elements.some(e=>e.tag==='pre'&&e.textContent===content));
 assert.ok(!elements.some(e=>e.tag==='script'));
 elements.find(e=>e.textContent==='下载文字产物').listeners.click();
 assert.equal(await blob.text(),content);assert.equal(downloads.at(-1).download,'art_test.md');
 assert.equal(vm.runInContext("engineVisualState('unhealthy', true).label",ctx),'异常');
});

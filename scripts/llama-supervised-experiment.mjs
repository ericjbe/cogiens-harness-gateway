import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdir, appendFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const e=process.env, exe=e.LLAMA_EXE, model=e.LLAMA_MODEL, workdir=e.LLAMA_WORKDIR;
const out=e.LLAMA_RESULT||'./llama-experiment-result.json', dir=e.LLAMA_EXPERIMENT_DIR||join(dirname(out),`experiment-${Date.now()}`);
const port=Number(e.LLAMA_PORT||11436), startupMs=Number(e.LLAMA_STARTUP_TIMEOUT_MS||120000), requestMs=Number(e.LLAMA_REQUEST_TIMEOUT_MS||30000);
if(!exe||!model||!workdir) throw new Error('LLAMA_EXE, LLAMA_MODEL and LLAMA_WORKDIR are required');
const args=['-m',model,'--host','127.0.0.1','--port',String(port),'-c','1024','-b','128','-t','4','-n','32','--temp','0'];
await mkdir(dir,{recursive:true}); const statePath=join(dir,'state.json'),eventsPath=join(dir,'events.jsonl');
const result={exe,model,workdir,args,port,started_at:new Date().toISOString(),events:[],probes:[]};
let persistQueue=Promise.resolve(), streamQueue=Promise.resolve();
function persist(task){persistQueue=persistQueue.then(task);return persistQueue;}
async function state(status,extra={}){return persist(async()=>{const p={...result,status,...extra},tmp=`${statePath}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(p,null,2));await rename(tmp,statePath);});}
async function event(type,data={}){const row={type,at:new Date().toISOString(),...data};result.events.push(row);return persist(async()=>{await appendFile(eventsPath,JSON.stringify(row)+'\n');const p={...result,status:type},tmp=`${statePath}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(p,null,2));await rename(tmp,statePath);});}
await state('STARTING'); await event('supervisor_start',{pid:process.pid});
const sock=createConnection({host:'127.0.0.1',port}); const occupied=await new Promise(r=>{sock.once('connect',()=>{sock.destroy();r(true)});sock.once('error',()=>r(false))});
if(occupied){await event('port_occupied',{port});result.finished_at=new Date().toISOString();await writeFile(out,JSON.stringify(result,null,2));process.exit(2);}
const child=spawn(exe,args,{cwd:workdir,shell:false,windowsHide:true}); result.pid=child.pid??null;
const stdoutPath=join(dir,'stdout.log'),stderrPath=join(dir,'stderr.log'); child.stdout.on('data',b=>{streamQueue=streamQueue.then(()=>appendFile(stdoutPath,b))}); child.stderr.on('data',b=>{streamQueue=streamQueue.then(()=>appendFile(stderrPath,b))});
child.on('error',err=>event('error',{error:String(err.message)})); let closeResolve;const closePromise=new Promise(r=>closeResolve=r);
child.on('exit',(code,signal)=>event('exit',{code,signal})); child.on('close',(code,signal)=>{event('close',{code,signal});closeResolve({code,signal})}); await event('spawn',{pid:child.pid});
async function health(){const c=new AbortController(),t=setTimeout(()=>c.abort(),Math.min(requestMs,3000));try{return(await fetch(`http://127.0.0.1:${port}/health`,{signal:c.signal})).ok}catch{return false}finally{clearTimeout(t)}}
let ready=false;const deadline=Date.now()+startupMs;while(Date.now()<deadline&&!ready&&child.exitCode===null){ready=await health();if(!ready)await new Promise(r=>setTimeout(r,1000))} result.startup_ready=ready;await event(ready?'ready':'startup_timeout',{pid:child.pid});
if(ready)for(let i=0;i<3;i++){const p={attempt:i+1,started_at:new Date().toISOString()},began=Date.now(),c=new AbortController(),t=setTimeout(()=>c.abort(),requestMs);try{const r=await fetch(`http://127.0.0.1:${port}/v1/chat/completions`,{method:'POST',headers:{'content-type':'application/json'},signal:c.signal,body:JSON.stringify({model:'qwen2.5:7b',messages:[{role:'user',content:'Reply with exactly SHUISHU_READY'}],max_tokens:8,temperature:0,stream:false})});const text=await r.text();p.http_status=r.status;p.elapsed_ms=Date.now()-began;try{const j=JSON.parse(text);p.response_text=j?.choices?.[0]?.message?.content??null;p.json_valid=true}catch{p.response_text=null;p.json_valid=false}p.instruction_followed=p.response_text?.trim()==='SHUISHU_READY'}catch(err){p.error=err.name==='AbortError'?'request_timeout':String(err.message);p.elapsed_ms=Date.now()-began}finally{clearTimeout(t)}p.finished_at=new Date().toISOString();result.probes.push(p);await event('probe_complete',p)}
result.stop={requested:true,reason:ready?'experiment_complete':'startup_timeout',at:new Date().toISOString()};await event('supervisor_stop_requested',result.stop);if(!child.killed)child.kill('SIGTERM');result.process_close=await Promise.race([closePromise,new Promise(r=>setTimeout(()=>r(null),10000))]);await streamQueue;await persistQueue;result.finished_at=new Date().toISOString();await event('experiment_complete',{process_close:result.process_close});await persistQueue;await writeFile(out,JSON.stringify(result,null,2));
console.log(JSON.stringify({output:out,pid:result.pid,startup_ready:ready,probes:result.probes.map(p=>({attempt:p.attempt,http_status:p.http_status,response_text:p.response_text,instruction_followed:p.instruction_followed,error:p.error})),process_close:result.process_close},null,2));

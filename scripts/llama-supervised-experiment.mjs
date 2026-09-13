import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const env = process.env;
const exe = env.LLAMA_EXE;
const model = env.LLAMA_MODEL;
const workdir = env.LLAMA_WORKDIR;
const outputPath = env.LLAMA_RESULT || './llama-experiment-result.json';
const port = Number(env.LLAMA_PORT || 11436);
const startupTimeoutMs = Number(env.LLAMA_STARTUP_TIMEOUT_MS || 120000);
const requestTimeoutMs = Number(env.LLAMA_REQUEST_TIMEOUT_MS || 30000);

if (!exe || !model || !workdir) throw new Error('LLAMA_EXE, LLAMA_MODEL and LLAMA_WORKDIR are required');
const args = ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-c', '1024', '-b', '128', '-t', '4', '-n', '32', '--temp', '0'];
const result = { exe, model, workdir, args, port, started_at: new Date().toISOString(), events: [], probes: [], stop: null };
const started = Date.now();
const child = spawn(exe, args, { cwd: workdir, shell: false, windowsHide: true });
result.pid = child.pid ?? null;
let stdout = '', stderr = '';
child.stdout.on('data', b => { stdout += b.toString(); });
child.stderr.on('data', b => { stderr += b.toString(); });
child.on('spawn', () => result.events.push({ type: 'spawn', at: new Date().toISOString(), pid: child.pid }));
child.on('error', error => result.events.push({ type: 'error', at: new Date().toISOString(), error: String(error.message) }));
child.on('exit', (code, signal) => result.events.push({ type: 'exit', at: new Date().toISOString(), code, signal }));
let closeResolve;
const closePromise = new Promise(resolve => { closeResolve = resolve; });
child.on('close', (code, signal) => { result.events.push({ type: 'close', at: new Date().toISOString(), code, signal }); closeResolve({ code, signal }); });

async function health() {
  try { const r = await fetch(`http://127.0.0.1:${port}/health`); return r.ok; } catch { return false; }
}
const deadline = Date.now() + startupTimeoutMs;
let ready = false;
while (Date.now() < deadline && !ready) { ready = await health(); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
result.ready_at = ready ? new Date().toISOString() : null;
result.startup_ready = ready;
if (ready) {
  for (let i = 0; i < 3; i++) {
    const began = Date.now();
    const probe = { attempt: i + 1, started_at: new Date().toISOString() };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ model: 'qwen2.5:7b', messages: [{ role: 'user', content: 'Reply with exactly SHUISHU_READY' }], max_tokens: 8, temperature: 0, stream: false }) });
      const text = await response.text();
      probe.http_status = response.status; probe.response = text; probe.elapsed_ms = Date.now() - began; probe.instruction_followed = text.includes('SHUISHU_READY');
    } catch (error) { probe.error = error.name === 'AbortError' ? 'request_timeout' : String(error.message); probe.elapsed_ms = Date.now() - began; }
    clearTimeout(timer); probe.finished_at = new Date().toISOString(); result.probes.push(probe);
  }
}
result.stop = { requested: true, reason: ready ? 'experiment_complete' : 'startup_timeout', at: new Date().toISOString() };
if (!child.killed) child.kill('SIGTERM');
const closed = await Promise.race([closePromise, new Promise(resolve => setTimeout(() => resolve(null), 10000))]);
result.process_close = closed;
result.stdout = stdout; result.stderr = stderr; result.finished_at = new Date().toISOString();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify({ output: outputPath, pid: result.pid, startup_ready: result.startup_ready, probes: result.probes.map(p => ({ attempt: p.attempt, http_status: p.http_status, elapsed_ms: p.elapsed_ms, instruction_followed: p.instruction_followed, error: p.error })), process_close: result.process_close }, null, 2));

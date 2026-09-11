import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DurableSender } from './sender.mjs';
import { collectRunnerResults } from './runner-source.mjs';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const signer = fileURLToPath(new URL('../../deploy/result-sync/service-identity.ps1', import.meta.url));
const sender = new DurableSender({ ...config, sign: input => new Promise((resolve, reject) => {
  const child = spawn('powershell.exe', ['-NoProfile','-NonInteractive','-File',signer,'-Mode','Sign','-KeyName',config.key_name], {windowsHide:true, stdio:['pipe','pipe','pipe']});
  let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.resume();
  child.on('error', reject); child.on('close', code => code === 0 ? resolve(Buffer.from(output.trim(),'base64')) : reject(new Error('SERVICE_SIGN_FAILED')));
  child.stdin.end(input.toString('base64'));
}) });
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
do {
  try {
    // Queue before contacting the network, including the first start while offline.
    const records = await collectRunnerResults(config);
    await sender.enqueue({schema_version:'shuishu.result-sync.v1',node_id:config.node_id,sent_at:new Date().toISOString(),records});
    const result = await sender.flush();
    process.stdout.write(JSON.stringify({event:'sync.delivered',...result, records:records.length, at:new Date().toISOString()})+'\n');
  } catch (error) {
    // Do not serialize local errors, filesystem paths or credentials into network payloads/log exports.
    process.stderr.write(JSON.stringify({event:'sync.retry_pending',at:new Date().toISOString()})+'\n');
    if (process.argv.includes('--once')) process.exitCode = 1;
  }
  if (process.argv.includes('--once') || stopping) break;
  await new Promise(resolve => setTimeout(resolve, Math.max(10000, config.interval_ms ?? 60000)));
} while (!stopping);

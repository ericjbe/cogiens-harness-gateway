import { readFile, readdir, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { atomicJson } from './store.mjs';
import { digest, signingInput, validateEnvelope } from './protocol.mjs';

export class DurableSender {
  constructor({ directory, endpoint, identity, sign, transport = fetch }) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new Error('HTTPS endpoint required');
    Object.assign(this, { directory, endpoint, identity, sign, transport }); this.serial = Promise.resolve();
  }
  async enqueue(envelope) {
    validateEnvelope(envelope);
    const body = JSON.stringify(envelope), id = digest(body);
    await atomicJson(path.join(this.directory, 'pending', `${id}.json`), { body }); return id;
  }
  flush() { const work = this.serial.then(() => this.drain()); this.serial = work.catch(() => {}); return work; }
  async drain() {
    const pending = path.join(this.directory, 'pending'), sent = path.join(this.directory, 'sent');
    await mkdir(pending, { recursive: true }); await mkdir(sent, { recursive: true });
    let delivered = 0;
    for (const filename of (await readdir(pending)).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).sort()) {
      const {body} = JSON.parse(await readFile(path.join(pending, filename), 'utf8'));
      const timestamp = String(Date.now()), nonce = randomBytes(16).toString('hex');
      const signature = await this.sign(signingInput(timestamp, nonce, body));
      const response = await this.transport(this.endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
        'content-type': 'application/json', origin: new URL(this.endpoint).origin,
        'x-shuishu-identity': this.identity, 'x-shuishu-timestamp': timestamp,
        'x-shuishu-nonce': nonce, 'x-shuishu-signature': Buffer.from(signature).toString('base64url')
      }, body });
      if (!response.ok) throw new Error(`SYNC_HTTP_${response.status}`);
      const receipt = await response.json();
      if (receipt.sha256 !== digest(body)) throw new Error('INVALID_RECEIPT');
      await atomicJson(path.join(sent, `${filename}.receipt`), receipt);
      await rename(path.join(pending, filename), path.join(sent, filename)); delivered++;
    }
    return { delivered };
  }
}

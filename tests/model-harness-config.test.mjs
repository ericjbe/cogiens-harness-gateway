import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadGatewayConfig } from '../packages/gateway-core/src/registry.mjs';

async function withConfig(payload, check) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shuishu-catalog-'));
  const file = path.join(directory, 'config.json');
  try {
    await writeFile(file, JSON.stringify(payload));
    await check(file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('HK candidate declares exactly ten free and six paid configurable slots', async () => {
  const file = new URL('../config/hk.json', import.meta.url);
  const source = JSON.parse(await readFile(file, 'utf8'));
  const loaded = await loadGatewayConfig((await import('node:url')).fileURLToPath(file));
  assert.equal(loaded.model_harness.slots.filter(slot => slot.access_class === 'free').length, 10);
  assert.equal(loaded.model_harness.slots.filter(slot => slot.access_class === 'paid').length, 6);
  assert.equal(source.model_harness.customer_access_ready, false);
  assert.equal(source.model_harness.slots.every(slot => !slot.adapter_id), true);
});

test('catalog config rejects duplicate ids and invalid policy enums', async () => {
  const base = { adapters: [], model_harness: { slots: [
    { slot_id: 'one', access_class: 'free', tenant_visibility: 'operator-only' }
  ] } };
  await withConfig(base, async file => assert.equal((await loadGatewayConfig(file)).model_harness.slots.length, 1));
  await withConfig({ ...base, model_harness: { slots: [...base.model_harness.slots, ...base.model_harness.slots] } },
    async file => assert.rejects(loadGatewayConfig(file), /Duplicate model harness slot_id/));
  await withConfig({ ...base, model_harness: { slots: [{ ...base.model_harness.slots[0], access_class: 'unknown' }] } },
    async file => assert.rejects(loadGatewayConfig(file), /Invalid access_class/));
  await withConfig({ ...base, model_harness: { slots: [{ ...base.model_harness.slots[0], tenant_visibility: 'anonymous' }] } },
    async file => assert.rejects(loadGatewayConfig(file), /Invalid tenant_visibility/));
});

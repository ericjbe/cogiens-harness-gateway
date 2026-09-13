import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../scripts/llama-supervised-experiment.mjs', import.meta.url), 'utf8');

test('supervisor uses non-shell spawn and records lifecycle events', () => {
  assert.match(source, /spawn\(exe,args,\{cwd:workdir,shell:false/);
  for (const name of ['supervisor_start', "event('spawn'", "event('exit'", "event('close'", "event('error'"]) assert.match(source, new RegExp(name.replace(/[()']/g, '\\$&')));
});

test('supervisor serializes atomic state and drains logs before result', () => {
  assert.match(source, /persistQueue/);
  assert.match(source, /rename\(tmp,statePath\)/);
  assert.match(source, /await streamQueue/);
  assert.match(source, /child\.exitCode===null/);
});

test('probe requires parsed JSON assistant text to equal sentinel', () => {
  assert.match(source, /JSON\.parse\(text\)/);
  assert.match(source, /response_text\?\.trim\(\)==='SHUISHU_READY'/);
});

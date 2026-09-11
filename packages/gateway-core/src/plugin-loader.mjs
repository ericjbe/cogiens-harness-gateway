import path from 'node:path';
import { realpath, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { validateDescriptor } from '../../adapter-sdk/src/index.mjs';

// Operator-installed, trusted code only. This is not a code sandbox or upload endpoint.
export async function loadPluginAdapter(entry, config) {
  if (!config.plugin_root || !path.isAbsolute(config.plugin_root)) throw new Error('plugin_root must be an explicit absolute directory');
  const root = await realpath(config.plugin_root);
  if (typeof entry.module !== 'string' || path.isAbsolute(entry.module)) throw new Error('Plugin module must be relative to plugin_root');
  const modulePath = await realpath(path.resolve(root, entry.module));
  const relative = path.relative(root, modulePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Plugin entry escapes plugin_root');
  if (!/^[a-f0-9]{64}$/i.test(entry.module_sha256 ?? '')) throw new Error('Plugin module_sha256 required');
  const digest = createHash('sha256').update(await readFile(modulePath)).digest('hex');
  if (digest !== entry.module_sha256.toLowerCase()) throw new Error('Plugin entry hash mismatch');
  if (!entry.plugin_version || !entry.license || !entry.owner) throw new Error('Plugin version, license and owner required');
  const loaded = await import(pathToFileURL(modulePath).href);
  if (typeof loaded.createAdapter !== 'function') throw new Error('Plugin must export createAdapter(config)');
  const adapter = await loaded.createAdapter(structuredClone(entry));
  for (const name of ['describe','health','createSession','startRun','collectArtifacts','cancel','close']) {
    if (typeof adapter?.[name] !== 'function') throw new Error('Plugin missing method: ' + name);
  }
  const descriptor = validateDescriptor(await adapter.describe({}));
  if (descriptor.adapter_id !== entry.id) throw new Error('Plugin adapter_id mismatch');
  return adapter;
}

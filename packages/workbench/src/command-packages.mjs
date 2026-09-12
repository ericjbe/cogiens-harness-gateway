import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LIMITS = Object.freeze({ files: 2000, compressed: 25 * 1024 * 1024, uncompressed: 100 * 1024 * 1024, ratio: 200 });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const cleanName = name => { const normalized = name.replaceAll("\\", "/"); if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) throw new Error("PATH_TRAVERSAL"); return normalized; };

export function inspectZip(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length > LIMITS.compressed) throw new Error("PACKAGE_TOO_LARGE");
  if (bytes.readUInt32LE(0) !== 0x04034b50) throw new Error("INVALID_ZIP");
  const entries = []; let offset = 0; let total = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const flags = bytes.readUInt16LE(offset + 6), method = bytes.readUInt16LE(offset + 8), compressed = bytes.readUInt32LE(offset + 18), uncompressed = bytes.readUInt32LE(offset + 22), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    if (flags & 0x08) throw new Error("ZIP_DATA_DESCRIPTOR_UNSUPPORTED");
    const name = cleanName(bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"));
    const dataStart = offset + 30 + nameLength + extraLength; if (dataStart + compressed > bytes.length) throw new Error("ZIP_TRUNCATED");
    if (entries.length + 1 > LIMITS.files) throw new Error("TOO_MANY_FILES"); total += uncompressed;
    if (total > LIMITS.uncompressed || (compressed && uncompressed / compressed > LIMITS.ratio)) throw new Error("ZIP_BOMB");
    entries.push({ name, method, compressed, uncompressed, dataStart }); offset = dataStart + compressed;
  }
  if (!entries.length || !entries.some(e => e.name === "manifest.json" || e.name === "work_orders.yaml")) throw new Error("MANIFEST_MISSING");
  for (let cursor = 0; cursor + 46 <= bytes.length; cursor += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) continue;
    const mode = bytes.readUInt32LE(cursor + 38) >>> 16;
    if ((mode & 0xf000) === 0xa000) throw new Error("SYMLINK_ENTRY");
  }
  return { sha256: digest(bytes), compressed_bytes: bytes.length, uncompressed_bytes: total, entries, bytes };
}

export function readEntry(zip, entry) { const raw = zip.bytes.subarray(entry.dataStart, entry.dataStart + entry.compressed); if (entry.method === 0) return raw; if (entry.method === 8) return inflateRawSync(raw); throw new Error("ZIP_METHOD_UNSUPPORTED"); }
export function parseCommandPackage(input) {
  const zip = inspectZip(input); const names = new Set(zip.entries.map(e => e.name)); const manifest = names.has("manifest.json") ? JSON.parse(readEntry(zip, zip.entries.find(e => e.name === "manifest.json"))) : null;
  const workOrders = names.has("work_orders.yaml") ? readEntry(zip, zip.entries.find(e => e.name === "work_orders.yaml")).toString("utf8") : null;
  return { sha256: zip.sha256, compressed_bytes: zip.compressed_bytes, uncompressed_bytes: zip.uncompressed_bytes, files: zip.entries.map(e => ({ name: e.name, bytes: e.uncompressed })), recognized: { manifest: Boolean(manifest), work_orders: Boolean(workOrders), readme: names.has("README") || names.has("README.md"), main_command: zip.entries.some(e => /(^|\/)(run|main|execute)\.(sh|ps1|cmd|py|js|mjs)$/.test(e.name)) }, manifest, work_orders_preview: workOrders?.slice(0, 4000) ?? null };
}

export class CommandPackageStore {
  constructor(root) { this.root = path.resolve(root); this.index = new Map(); }
  async initialize() { await mkdir(this.root, { recursive: true }); try { const rows = JSON.parse(await readFile(path.join(this.root, "index.json"), "utf8")); for (const row of rows) this.index.set(row.sha256, row); } catch {} return this; }
  async ingest(input, metadata = {}) { const report = parseCommandPackage(input); const existing = this.index.get(report.sha256); if (existing) return { ...existing, idempotent: true }; const file = path.join(this.root, `${report.sha256}.zip`); await writeFile(file, input, { mode: 0o600 }); const row = { ...report, package_path: file, project_id: metadata.project_id ?? null, status: "QUARANTINED", imported_at: new Date().toISOString() }; this.index.set(report.sha256, row); await writeFile(path.join(this.root, "index.json"), JSON.stringify([...this.index.values()].map(({ bytes, ...v }) => v))); return { ...row, idempotent: false }; }
  list() { return [...this.index.values()].map(({ package_path, ...row }) => row); }
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function text(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const files = {
  readme: await text("README.md"),
  chinese: await text("README.zh-CN.md"),
  faq: await text("docs/FAQ.md"),
  guide: await text("docs/BUILD_AN_ADAPTER.md"),
  catalog: await text("docs/ADAPTER_CATALOG.md"),
  jobs: await text("docs/DIGITAL_JOB_PACKS.md"),
  llms: await text("llms.txt"),
  citation: await text("CITATION.cff")
};

const socialPreview = await readFile(path.join(root, "docs/assets/chg-social-preview.png"));
assert.equal(socialPreview.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "Social preview must be a PNG");
assert.equal(socialPreview.readUInt32BE(16), 1280, "Social preview must be 1280 pixels wide");
assert.equal(socialPreview.readUInt32BE(20), 640, "Social preview must be 640 pixels high");
assert.ok(socialPreview.byteLength < 1_000_000, "Social preview must remain under 1 MB");

const canonicalDefinition = /vendor-neutral (?:gateway|interoperability, routing, and governance layer)/i;
assert.match(files.readme, canonicalDefinition, "README must contain the canonical product definition");
assert.match(files.faq, canonicalDefinition, "FAQ must contain the canonical product definition");
assert.match(files.llms, canonicalDefinition, "llms.txt must contain the canonical product definition");

for (const [name, content] of Object.entries({ readme: files.readme, faq: files.faq, llms: files.llms })) {
  assert.match(content, /not (?:another |a )?model API router/i, `${name} must distinguish CHG from model API routing`);
}

assert.match(files.readme, /README\.zh-CN\.md/, "README must link to the Chinese entry point");
assert.match(files.chinese, /模型 API 路由器/, "Chinese README must explain the product category");
assert.match(files.guide, /official SDK|official structured interface/i, "Adapter guide must require an official interface");
assert.match(files.catalog, /In-memory Mock Harness/, "Adapter catalog must list the verified reference adapter");
assert.match(files.catalog, /Not yet published/, "Adapter catalog must not imply planned adapters are available");
assert.match(files.jobs, /does \*\*not\*\* define a stable Digital Job Pack contract/, "Job Pack page must state the current boundary");
assert.match(files.llms, /experimental navigation aid/i, "llms.txt must state its experimental status");
assert.match(files.llms, /not an access-control mechanism/i, "llms.txt must not imply security or ranking guarantees");
assert.match(files.citation, /^cff-version: 1\.2\.0/m, "CITATION.cff must use CFF 1.2.0");
assert.match(files.citation, /repository-code: "https:\/\/github\.com\/ericjbe\/cogiens-harness-gateway"/, "Citation metadata must use the canonical repository");

const forbiddenClaims = [
  /production-ready Codex adapter/i,
  /production-ready Grok adapter/i,
  /production-ready Qwen adapter/i,
  /production-ready DeepSeek adapter/i,
  /(?:ships|includes|provides) (?:a )?stable Digital Job Pack contract/i
];

for (const [name, content] of Object.entries(files)) {
  for (const claim of forbiddenClaims) {
    assert.doesNotMatch(content, claim, `${name} contains an unsupported availability claim: ${claim}`);
  }
}

console.log(`PASS verify-discoverability: ${Object.keys(files).length} canonical entry points and social preview verified`);

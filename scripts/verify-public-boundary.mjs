import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "LICENSE",
  "README.md",
  "README.zh-CN.md",
  "CITATION.cff",
  "llms.txt",
  "COMMERCIAL.md",
  "TRADEMARKS.md",
  "GOVERNANCE.md",
  "CONTRIBUTING.md",
  "DCO.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "NOTICE",
  "THIRD_PARTY_NOTICES.md"
];
const excludedDirectories = new Set([".git", "node_modules", "coverage", "dist", "tmp"]);
const forbiddenDirectoryNames = new Set(["enterprise", "commercial-private", "proprietary", "customer-data", "credentials", "secrets"]);
const textExtensions = new Set(["", ".md", ".json", ".mjs", ".js", ".ts", ".yml", ".yaml", ".txt", ".cff", ".svg"]);
const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{30,}/],
  ["provider key", new RegExp(`${["s", "k-"].join("")}[A-Za-z0-9_-]{20,}`)],
  ["AWS access key", /AKIA[A-Z0-9]{16}/]
];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath);
  assert.equal((await stat(absolutePath)).isFile(), true, `Required file missing: ${relativePath}`);
}

const license = await readFile(path.join(root, "LICENSE"), "utf8");
assert.match(license, /^MIT License/m);
assert.match(license, /Permission is hereby granted, free of charge/);
assert.doesNotMatch(license, /non-commercial|commercial use prohibited/i);

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.license, "MIT");
assert.equal(packageJson.private, false);

const findings = [];
let scannedFiles = 0;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (excludedDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath);
    if (entry.isDirectory()) {
      if (forbiddenDirectoryNames.has(entry.name.toLowerCase())) findings.push(`${relativePath}: forbidden public-core directory`);
      await walk(absolutePath);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === ".env" || (entry.name.startsWith(".env.") && entry.name !== ".env.example")) {
      findings.push(`${relativePath}: environment file must not be committed`);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    scannedFiles += 1;
    const content = await readFile(absolutePath, "utf8");
    for (const [label, pattern] of secretPatterns) {
      if (pattern.test(content)) findings.push(`${relativePath}: possible ${label}`);
    }
  }
}

await walk(root);
assert.deepEqual(findings, [], `Public-boundary findings:\n${findings.join("\n")}`);
console.log(`PASS verify-public-boundary: ${scannedFiles} text files scanned`);

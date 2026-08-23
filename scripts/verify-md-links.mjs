#!/usr/bin/env node
/**
 * Dependency-free Markdown relative-link checker.
 * Scans tracked *.md files; ignores http(s), mailto, and same-page anchors.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoreDirs = new Set([".git", "node_modules", "dist", "build", "coverage"]);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) out.push(p);
  }
  return out;
}

const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
const failures = [];

for (const file of walk(root)) {
  const text = fs.readFileSync(file, "utf8");
  let m;
  while ((m = linkRe.exec(text))) {
    let target = m[2].trim().replace(/^<|>$/g, "");
    if (!target || target.startsWith("#")) continue;
    const lower = target.toLowerCase();
    if (lower.startsWith("http:") || lower.startsWith("https:") || lower.startsWith("mailto:")) continue;
    const hash = target.indexOf("#");
    if (hash >= 0) target = target.slice(0, hash);
    if (!target) continue;
    const abs = path.resolve(path.dirname(file), decodeURIComponent(target));
    if (!abs.startsWith(root)) {
      failures.push({ file, target: m[2], reason: "escapes repo root" });
      continue;
    }
    if (!fs.existsSync(abs)) {
      failures.push({ file: path.relative(root, file), target: m[2], reason: "missing" });
    }
  }
}

if (failures.length) {
  console.error(`Markdown link check failed (${failures.length}):`);
  for (const f of failures) {
    console.error(`  ${f.file} -> ${f.target} (${f.reason})`);
  }
  process.exit(1);
}
console.log("Markdown link check passed.");

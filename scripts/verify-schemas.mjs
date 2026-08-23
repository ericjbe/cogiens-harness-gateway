import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDirectory = path.join(root, "schemas");
const fileNames = (await readdir(schemaDirectory)).filter((name) => name.endsWith(".schema.json")).sort();

assert.equal(fileNames.length, 8, "v0.3.0-alpha.1 requires eight public schemas");

const ids = new Set();
for (const fileName of fileNames) {
  const absolutePath = path.join(schemaDirectory, fileName);
  const schema = JSON.parse(await readFile(absolutePath, "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", `${fileName}: wrong draft`);
  assert.equal(typeof schema.$id, "string", `${fileName}: missing $id`);
  assert.ok(!ids.has(schema.$id), `${fileName}: duplicate $id`);
  ids.add(schema.$id);
  assert.equal(schema.type, "object", `${fileName}: root type must be object`);
  assert.ok(Array.isArray(schema.required), `${fileName}: required array is missing`);
  assert.equal(typeof schema.properties, "object", `${fileName}: properties are missing`);
}

console.log(`PASS verify-schemas: ${fileNames.length} schemas parsed with unique IDs`);

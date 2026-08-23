import { readFile } from "node:fs/promises";

const [command = "help", ...argv] = process.argv.slice(2);
const base = process.env.CHG_URL ?? "http://127.0.0.1:8787";
const token = process.env.CHG_API_TOKEN ?? "";

if (command === "health") print(await request("GET", "/health"));
else if (command === "adapters") print(await request("GET", "/v1/adapters"));
else if (command === "federation") print(await request("GET", "/v1/federation/registry"));
else if (["harness", "capabilities", "passport"].includes(command)) {
  const id = argv[0];
  if (!id) fail(`Usage: node scripts/chg.mjs ${command} HARNESS_ID`);
  const suffix = command === "harness" ? "" : `/${command}`;
  print(await request("GET", `/v1/federation/harnesses/${encodeURIComponent(id)}${suffix}`));
}
else if (command === "job") {
  const id = argv[0];
  if (!id) fail("Usage: node scripts/chg.mjs job JOB_ID");
  print(await request("GET", `/v1/jobs/${id}`));
} else if (command === "fanout") {
  const options = parseOptions(argv);
  const workspace = options.workspace;
  if (!workspace) fail("--workspace is required");
  let prompt = options.prompt;
  if (options["prompt-file"]) prompt = await readFile(options["prompt-file"], "utf8");
  if (!prompt) fail("--prompt or --prompt-file is required");
  const body = {
    workspace,
    prompt,
    timeout_seconds: options.timeout ? Number(options.timeout) : undefined,
    max_concurrency: options.concurrency ? Number(options.concurrency) : undefined,
    network: options.network ?? "restricted"
  };
  if (options.adapters) body.adapters = options.adapters.split(",").map((value) => value.trim()).filter(Boolean);
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
  let job = await request("POST", "/v1/jobs/fanout", body);
  process.stdout.write(`Submitted ${job.job_id}\n`);
  if (options.wait !== "false") {
    while (job.gateway_status === "RUNNING") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      job = await request("GET", `/v1/jobs/${job.job_id}`);
      const states = job.runs.map((run) => `${run.adapter_id}:${run.state}`).join(" | ");
      process.stdout.write(`${states}\n`);
    }
  }
  print(job);
  if (job.gateway_status === "FAILED") process.exitCode = 2;
} else {
  process.stdout.write("Cogiens Harness Gateway CLI\n\n");
  process.stdout.write("  health\n  adapters\n  federation\n  harness HARNESS_ID\n  capabilities HARNESS_ID\n  passport HARNESS_ID\n  job JOB_ID\n");
  process.stdout.write("  fanout --workspace ABS_PATH --prompt-file task.txt [--adapters id1,id2] [--timeout 1800] [--concurrency 3]\n");
}

async function request(method, pathname, body) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${base}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    fail(`Cannot reach CHG at ${base}: ${error instanceof Error ? error.message : error}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) fail(`${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

function parseOptions(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) fail(`Unexpected argument: ${key}`);
    const name = key.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) result[name] = "true";
    else { result[name] = value; index += 1; }
  }
  return result;
}

function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function fail(message) { process.stderr.write(`${message}\n`); process.exit(1); }

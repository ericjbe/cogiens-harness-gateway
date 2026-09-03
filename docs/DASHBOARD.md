# M-3 Joint Harness Command Dashboard

Status: Dashboard v1

## Purpose

The Dashboard is the human command surface for the Cogiens Eight-Harness Federation on M-3. It does not replace the Gateway; it exposes Gateway state in a form that a project owner can operate without memorizing CLI commands.

## V1 capabilities

- Show H01-H08 federation registry state.
- Show machine-local configured Adapter health.
- Probe the frozen ten-model Ollama pool.
- Show recent in-memory Jobs, Runs, terminal results and artifact counts.
- Compute a simple recent-run success/average-duration Arena view.
- Submit a bounded fan-out Job from the browser.
- Support bearer-token protected Gateway APIs when CHG is bound beyond loopback.

## Start on M-3

```powershell
cd D:\FND\M3-Harness-Projects\01_projects\cogiens-harness-gateway
git fetch --all --prune
git switch main
git pull --ff-only
npm run verify
npm run gateway
```

Then open:

```text
http://127.0.0.1:8787/dashboard/
```

If `CHG_HOST` is configured beyond loopback, the Gateway requires `CHG_API_TOKEN`. Enter that token into the Dashboard token field; it is kept in browser `sessionStorage`, not written to the repository.

## M-3 model probe

The Dashboard probes:

```text
OLLAMA_BASE_URL (default http://127.0.0.1:11434)
```

against `config/local-model-pool.v0.1.json`, which freezes the ten-model Arena cohort.

## Safety boundary

The Dashboard does not bypass Gateway policy. Dispatch uses the existing `/v1/jobs/fanout` API, so workspace validation, adapter limits, runtime limits and restricted-network defaults remain enforced.

V1 does not merge code, deploy production, approve its own results, or turn an unverified Harness into ACTIVE. Those remain evidence-gated operations.

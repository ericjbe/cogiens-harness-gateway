# 水枢 · Cogiens Workforce OS Dashboard

Status: Dashboard v1

## Product identity

- Chinese product brand: **水枢**
- English platform name: **Cogiens Workforce OS**
- Internal execution layer: **Cogiens Harness Gateway**
- H01-H08 remain engineering execution engines and are not the public product brand.

## Standard Cogiens header

水枢 uses the same **Cogiens Universal Header Plugin** as the other Cogiens products. It follows the ONE_PLUGIN_ONE_BOOTSTRAP rule and does not copy a product-specific header implementation into this repository.

Canonical bootstrap:

```html
<script
  src="https://www.cogiens.com/brand/js/cogiens-header-bootstrap.js"
  data-product="水枢"
  defer></script>
```

The Dashboard Content-Security-Policy explicitly permits only the required `cogiens.com` header resources in addition to same-origin assets. The 水枢 product banner is a separate section below the universal header so global header CSS cannot collide with the product-specific banner.

The Dashboard brand palette follows the Cogiens visual system: deep navy, Cogiens blue/cyan, orange accents, cool gray, white panels, and a matching dark theme driven by `data-cg-theme`.

## Purpose

The Dashboard is the human operating surface for 水枢 / Cogiens Workforce OS on M-3. It exposes digital jobs, execution-engine state, local models, Jobs, Runs, artifacts and evidence without requiring the operator to remember CLI commands.

## V1 capabilities

- Show H01-H08 execution-engine registry state.
- Show machine-local configured Adapter health.
- Probe the frozen ten-model local pool.
- Show recent in-memory Jobs, Runs, terminal results and artifact counts.
- Compute a simple recent-run success/average-duration Arena view.
- Submit a bounded fan-out Job from the browser.
- Support bearer-token protected Gateway APIs when CHG is bound beyond loopback.

## Start on M-3

For R0 installation and engineering maintenance:

```powershell
cd D:\FND\M3-Harness-Projects\01_projects\cogiens-harness-gateway
git fetch --all --prune
git switch main
git pull --ff-only
.\INSTALL_M3_DESKTOP_SHORTCUT.cmd
```

After one-time installation, normal operators use the **水枢** desktop shortcut instead of entering the repository.

Local URL:

```text
http://127.0.0.1:8787/dashboard/
```

If `CHG_HOST` is configured beyond loopback, the Gateway requires `CHG_API_TOKEN`. The browser stores the token in `sessionStorage`, not in the repository.

## M-3 model probe

The Dashboard probes:

```text
OLLAMA_BASE_URL (default http://127.0.0.1:11434)
```

against `config/local-model-pool.v0.1.json`.

## Safety boundary

The Dashboard does not bypass Gateway policy. Dispatch uses the existing `/v1/jobs/fanout` API, so workspace validation, adapter limits, runtime limits and restricted-network defaults remain enforced.

V1 does not merge code, deploy production, approve its own results, or turn an unverified execution engine into ACTIVE. Those remain evidence-gated operations.

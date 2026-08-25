# WP01 + WP02 Codex Submission Report

## Scope and baseline

- Program: CGS-HARNESS-GATE-001 v0.4-P0
- Branch: `feat/chg-v0.4-p0-dashboard`
- Baseline: `72d193520671780fdf2300a5ba381f9b604b9432`
- Work packages: WP01 Fleet Registry and WP02 Local Joint Command Dashboard
- Product theorem: ONE COMMAND IN -> JOINT RESULT OUT.

## Architecture reused

This implementation extends the existing v0.3 local gateway. It does not create a second gateway. `GatewayRuntime` remains the execution authority and retains the existing Job/Run model, bounded workspace validation, persistence under the configured data root, cancellation, provider-neutral events, artifact collection, and secret redaction. The existing adapter registry and `OneShotProcessAdapter` remain the adapter boundary.

`FleetRegistry` adds a product-facing H01-H08 inventory over the configured adapter registry and safe executable/auth health probes. `MissionService` translates a dashboard mission and fleet selection into the existing `submitFanout` contract. The HTTP handler adds normalized product routes and static dashboard delivery while retaining the v0.3 routes.

The server now fails startup for any host other than `127.0.0.1`, `::1`, or `localhost`.

## Files changed

- `.gitignore` - ignores the repository-local `.chg-tmp` runtime cache.
- `adapters/process/src/one-shot-process-adapter.mjs` - bounds the Windows `taskkill` helper and falls back to direct child termination.
- `apps/gateway/src/app.mjs` - testable HTTP handler for existing and product APIs plus dashboard assets.
- `apps/gateway/src/server.mjs` - composes the existing runtime with Fleet Registry and Mission Service; enforces loopback-only binding.
- `apps/gateway/public/index.html` - War Room product surface.
- `apps/gateway/public/dashboard.js` - fleet discovery, selection, roles, mission creation, dispatch, and result polling.
- `apps/gateway/public/dashboard.css` - responsive local command dashboard styling.
- `config/harnesses.example.json` - enables the existing H01 Codex adapter by default.
- `packages/gateway-core/src/fleet-registry.mjs` - normalized H01-H08 registry and safe health projection.
- `packages/gateway-core/src/mission-service.mjs` - mission draft, fleet mapping, dispatch, and run lookup.
- `scripts/verify-public-boundary.mjs` - excludes the designated repository-local ephemeral cache.
- `tests/product/codex-subscription.test.mjs` - non-interactive subscription path and no-key-fallback assertion.
- `tests/product/dashboard-api.test.mjs` - fleet, dashboard, mission, dispatch, run, and event API integration tests.
- `tests/product/fleet-registry.test.mjs` - eight-entry normalization, safe fields, and login-required tests.
- `tests/product/mission-service.test.mjs` - fleet selection, mocked H01 dispatch, and explicit unsupported behavior.

The pre-existing untracked `docs/work_packages/` content was not modified by this implementation.

## API endpoints

Product API:

- `GET /api/v1/fleet`
- `POST /api/v1/missions`
- `POST /api/v1/missions/{mission_id}/dispatch`
- `GET /api/v1/runs/{run_id}`
- `GET /api/v1/runs/{run_id}/events`

Retained v0.3 API:

- `GET /health`
- `GET /v1/adapters`
- `POST /v1/jobs/fanout`
- `GET /v1/jobs/{job_id}`
- `POST /v1/jobs/{job_id}/runs/{run_id}/cancel`

## H01 dispatch mechanism

The dashboard posts the mission prompt and selected `H01` fleet ID directly to the local gateway. `MissionService` maps `H01` to the existing `openai.codex.cli` adapter and calls `GatewayRuntime.submitFanout`. The existing Codex adapter performs `codex login status` during health preflight and invokes:

```text
codex exec --json --ephemeral --color never --sandbox workspace-write --ask-for-approval never --skip-git-repo-check -C <bounded-workspace> -
```

The mission prompt is written to Codex stdin. No dashboard copy/paste step is required. Events and artifacts return through the existing provider-neutral Run lifecycle.

## Subscription and auth behavior

H01 is declared `LOCAL_CLI_SESSION` with `SUBSCRIPTION_INCLUDED`, `subscription_reused: true`, and `api_key_required: false`. The gateway reuses the Codex CLI/ChatGPT sign-in session supported by `codex login`; it does not accept credentials in mission bodies, print tokens, persist tokens, inspect account identity, or expose quota unless the provider safely exposes it.

There is no OpenAI API-key fallback in the H01 invocation. If Codex is absent, health is `NOT_INSTALLED`. If `codex login status` fails, health is `LOGIN_REQUIRED` with `last_error: codex_not_authenticated`, and runtime preflight fails explicitly with `ADAPTER_UNHEALTHY`.

Local preflight on 2026-08-24 found `codex-cli 0.149.0` installed and `codex login status` reported `Not logged in`. Therefore a real mission was not dispatched during submission; the one-click path is runnable after local sign-in.

## Tests and results

`npm run verify` passed on 2026-08-24:

- schema verification: PASS, 6 schemas
- MIT public-boundary verification: PASS, 86 text files scanned
- discoverability verification: PASS, 8 canonical entry points
- Node test suite: PASS, 21/21 tests

Mandatory coverage:

1. H01-H08 registry load: covered.
2. Fleet endpoint returns eight entries: covered by loopback HTTP integration test.
3. Auth/billing fields without secrets: covered.
4. Dashboard renders cards from fleet API data: covered; dashboard source contains no vendor card data.
5. Mission creation: covered at service and HTTP levels.
6. Fleet selection and role preservation: covered.
7. Dispatch service accepts H01: covered.
8. Mocked adapter/runtime dispatch: covered.
9. Real H01 smoke path: documented below and runnable after sign-in.
10. Missing/login-required Codex failure: covered.
11. No hidden API-key fallback: covered by invocation assertion.
12. Existing v0.3 tests: green within the 21-test suite.

## Dashboard start command

From the repository root:

```powershell
npm run gateway
```

Open `http://127.0.0.1:8787/`. `CHG_HOST` cannot be used to expose this WP02 server beyond loopback.

## H01 one-click smoke procedure

1. Run `codex login` once and complete the supported Codex/ChatGPT sign-in flow.
2. Confirm `codex login status` exits successfully. Do not set or paste an OpenAI API key for this path.
3. Run `npm run gateway` from the repository root.
4. Open `http://127.0.0.1:8787/`.
5. Enter Project, Campaign, Mission, and mission text. Leave Workspace blank to use the bounded repository root, or enter an existing absolute local directory.
6. Select the H01 card, optionally enter its role, and click **DEPLOY MISSION** once.
7. Observe Campaign State and the Result / Artifacts panel. The UI polls the normalized Run API until a terminal state.
8. To exercise the explicit failure path, run `codex logout`, restart the gateway, and inspect H01: it reports `LOGIN_REQUIRED`; dispatch fails preflight without attempting an API key.

## Known limitations

- Mission drafts and run-to-job indexes are in-memory for this P0 surface; Jobs/Runs/events/artifacts continue to use existing runtime persistence.
- The result panel polls complete Run snapshots; server-sent event streaming is not included in P0.
- Decision Center is intentionally a placeholder; no approval decision API was added.
- Current-account and quota fields remain `null` because the supported CLI probes do not safely expose them.
- H01 was installed but logged out in the submission environment, so the live smoke procedure was preflighted rather than executed.

## Remaining H02-H08 work

- Add or promote vendor adapters only where a supported non-interactive local CLI/session mechanism exists.
- Define vendor-specific auth probes inside those adapters and map their safe results into the provider-neutral registry.
- Confirm billing classification with each supported local subscription, fixed coding plan, enterprise seat, free quota, API usage, or local compute mode.
- Add conformance, cancellation, artifact, missing-login, and no-hidden-fallback tests per adapter.
- H05 retains the existing DeepSeek adapter path; it still requires its documented environment reference and is not presented as subscription-backed.
- Unsupported selections fail explicitly with `CAPABILITY_UNSUPPORTED`; support is never simulated.

## No-production attestation

No production environment, customer system, remote deployment target, credentials, provider session files, commercial modules, or production configuration were accessed or changed. No merge or deployment was performed. All server and HTTP integration activity was bound to `127.0.0.1` only.

SUBMITTED_FOR_REVIEW

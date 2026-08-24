# WP01 + WP02 Codex Rework R1 Report

## Outcome

R1 closes the process-environment, dashboard-authentication, workspace-confinement, fleet-metadata, public-boundary, compatibility-documentation, and fleet-probe findings. The implementation remains local-only and subscription-first. No production or customer system was accessed.

Two acceptance gates remain externally blocked: this execution profile cannot write the repository's `.git` directory, and the local Codex CLI session visible to gateway child processes is not authenticated. A commit/clean-checkout proof and a real dashboard-driven H01 `SUCCEEDED` run therefore cannot truthfully be reported from this context.

## H02 finding-by-finding disposition

### Critical 1 — untracked implementation

Implementation files are present and verified, but closure is blocked by repository permissions. `git add ... && git commit ...` failed before staging with `fatal: Unable to create '.git/index.lock': Permission denied`. The supplied filesystem policy exposes `.git` read-only, so this agent cannot create the required commit or a branch-based clean checkout. `git status` consequently still shows the new WP01/WP02 deliverables as untracked. A repository owner with `.git` write access must stage the files listed below, commit them on `feat/chg-v0.4-p0-dashboard`, and run `npm run verify` from a clean checkout. This finding is **BLOCKED**, not claimed resolved.

### Critical 2 — outer versus nested Codex authentication

Root-caused, but the live-success acceptance gate is blocked by unavailable local credentials. The outer H01 launcher authentication is an execution-service session; it is not evidence of a local Codex CLI login available to processes spawned by the repository. Directly in the same environment used by the gateway, `codex --version` returns `codex-cli 0.149.0`, `CODEX_HOME` is unset, and `codex login status` returns `Not logged in`. The adapter health probe uses that exact child-process path and correctly returns `LOGIN_REQUIRED`; it does not dispatch or fall back to an API key.

No credential was copied, synthesized, inspected, or persisted. Completing this gate requires the operator to run the supported `codex login` flow in the same Windows user/profile context and then rerun the dashboard smoke. Until an actual terminal `SUCCEEDED` run and artifact exist, real H01 smoke readiness is **BLOCKED**, not “documented/runnable” or “proven.”

### High 1 — hidden API-key fallback

Resolved in the actual spawn path. `OneShotProcessAdapter` now supports an explicit blocked-environment list. The Codex adapter blocks `OPENAI_API_KEY` for both `codex login status` and `codex exec`. An executable test sets `OPENAI_API_KEY` in the parent, launches a real child through `runChild`, and proves the child sees it as absent. Other adapters retain their own vendor-specific environment behavior.

### High 2 — unauthenticated arbitrary workspace dispatch

Resolved. Server startup fails unless the configured token environment variable (normally `CHG_API_TOKEN`) is non-empty. Static dashboard assets remain loadable, but every API endpoint requires the bearer token. The dashboard accepts the token in a password field and keeps it only in page memory. `MissionService` rejects any workspace outside `CHG_SAFE_WORKSPACE_ROOT`, which defaults to the repository root. The UI presents a prominent write-access warning.

### Medium 1 — enabled example Codex adapter

Mitigated without weakening the one-click path. H01 remains enabled in the example configuration, but it is unreachable for API dispatch unless the operator explicitly supplies `CHG_API_TOKEN`; the server refuses unsafe startup otherwise. It remains loopback-only.

### Medium 2 — unverified fleet auth/billing claims

Resolved. H02, H03, H04, H06, H07, and H08 are explicitly unadapted and now report `UNKNOWN_REQUIRES_REVIEW` for authentication and billing, `UNAVAILABLE` transport, and `NOT_YET_ADAPTED` headless mode. H05 retains its existing real adapter mapping and explicit API-key environment-reference classification.

### Medium 3 — `.chg-tmp` boundary exclusion

Resolved. `.chg-tmp` is scanned again by the MIT public-boundary verifier. Only its V8 `node-compile-cache` binary subtree is excluded from text scanning; prompt/output or other files under `.chg-tmp` remain subject to the boundary check.

### Medium 4 — loopback-only compatibility change

Accepted and explicitly documented here. v0.4-P0 intentionally removes v0.3’s token-enabled non-loopback bind option. A token does not permit remote binding; `CHG_HOST` must resolve to `127.0.0.1`, `::1`, or `localhost`. This is a deliberate security compatibility break for WP02.

### Low 1 — Windows `taskkill` fallback test

Not added in R1. Existing timeout/cancellation tests remain green, but the Windows-specific simulated hung-`taskkill` branch is a remaining unit-test gap.

### Low 2 — repeated GET probes

Resolved. Fleet discovery is cached for 30 seconds, bounding executable version probes across dashboard polling/reloads while retaining current local health information.

## Files changed

- `.gitignore`
- `adapters/codex-cli/src/index.mjs`
- `adapters/process/src/one-shot-process-adapter.mjs`
- `apps/gateway/src/app.mjs`
- `apps/gateway/src/server.mjs`
- `apps/gateway/public/index.html`
- `apps/gateway/public/dashboard.js`
- `apps/gateway/public/dashboard.css`
- `config/harnesses.example.json`
- `packages/gateway-core/src/fleet-registry.mjs`
- `packages/gateway-core/src/mission-service.mjs`
- `scripts/verify-public-boundary.mjs`
- `tests/product/codex-subscription.test.mjs`
- `tests/product/dashboard-api.test.mjs`
- `tests/product/fleet-registry.test.mjs`
- `tests/product/mission-service.test.mjs`
- `docs/reports/WP01_WP02_CODEX_SUBMISSION.md`
- `docs/reports/WP01_WP02_CODEX_REWORK_R1.md`

## Tests run and results

`npm run verify` on 2026-08-24:

- schema verification: PASS, 6 schemas
- MIT public-boundary verification: PASS, 89 text files scanned
- discoverability verification: PASS, 8 canonical entry points
- Node tests: PASS, 23/23
- new executable environment test: PASS; inherited `OPENAI_API_KEY` absent in spawned child
- new unauthenticated API test: PASS; fleet API returns HTTP 401 without bearer token
- new workspace confinement test: PASS; parent-directory workspace returns `WORKSPACE_INVALID`
- unadapted fleet metadata assertions: PASS

Source-control attempt:

- `git add ... && git commit -m "feat: add authenticated local command dashboard"`: BLOCKED before staging; `.git/index.lock` permission denied
- clean-checkout verification: NOT RUN because no commit could be created

## Real H01 smoke readiness

Status: **BLOCKED — LOGIN_REQUIRED**.

The dashboard-to-`MissionService`-to-`GatewayRuntime`-to-`OneShotProcessAdapter` path is implemented and covered with mocked runtime integration. The real local CLI preflight fails before dispatch because `codex login status` reports `Not logged in`. No real run ID or artifact is claimed. After an operator completes `codex login` in the same local profile, the required smoke must be executed with `CHG_API_TOKEN` set and a workspace under `CHG_SAFE_WORKSPACE_ROOT`; acceptance requires a terminal `SUCCEEDED` run and captured artifact.

## Remaining limitations

- Real H01 dashboard smoke remains blocked on a genuine local Codex/ChatGPT CLI session.
- Branch reproducibility remains blocked until a repository owner commits the untracked implementation and verifies a clean checkout.
- Mission drafts and run indexes remain in memory; runtime Jobs/Runs/events/artifacts retain existing persistence.
- Results use polling rather than server-sent events.
- The Decision Center remains a placeholder.
- Windows hung-`taskkill` fallback lacks a dedicated simulation test.
- Fleet probe cache is process-local and expires after 30 seconds.

## No-production attestation

No production environment, customer system, remote deployment, credentials, provider session files, production configuration, or commercial Cogiens module was accessed or changed. No deployment or merge to `main` was performed. All network-facing behavior remains loopback-only. No API-key fallback was added.

RESUBMITTED_FOR_REVIEW

# H02 Engineering Review

## Verdict
REWORK_REQUIRED

## Critical Findings

**1. Implementation is not committed to the branch — submission is not reproducible from git.**
`git status` shows only `.gitignore`, `one-shot-process-adapter.mjs`, `server.mjs`, `config/harnesses.example.json`, and `scripts/verify-public-boundary.mjs` as tracked modifications. Every other deliverable — `apps/gateway/src/app.mjs`, the entire `apps/gateway/public/` dashboard, `packages/gateway-core/src/fleet-registry.mjs`, `packages/gateway-core/src/mission-service.mjs`, and all of `tests/product/` — is untracked (`??`). `server.mjs` now imports `./app.mjs`, `fleet-registry.mjs`, and `mission-service.mjs` directly, so a clean checkout of `feat/chg-v0.4-p0-dashboard` (fresh clone, CI runner, or another reviewer's checkout) would fail to import and would not run — `npm run verify` only passed against H01's uncommitted working tree, not against the branch as it actually exists in version control. This means "SUBMITTED_FOR_REVIEW" is not currently a true statement of repo state; the branch as committed is broken.

**2. Real, non-mocked H01 dashboard dispatch is not proven, and there is an unresolved auth-context discrepancy that the report does not surface.**
Per the review packet: an outer launcher authenticated Codex via the user's ChatGPT login and dispatched non-interactively, but a *nested* `codex login status` invoked during the sandboxed run reported "Not logged in." The H01 report instead attributes the absence of a real dispatch to the local environment simply being logged out ("Local preflight ... reported `Not logged in`. Therefore a real mission was not dispatched"). These are two different explanations for the same symptom, and only one appears in the submission. If the gateway's spawned child process (via `OneShotProcessAdapter`, `env: { ...process.env, ...env }`) cannot see the same Codex credential state that an authenticated outer session sees, RC0's hard requirement — "H01 Codex must receive a mission non-interactively... using the existing local Codex/ChatGPT sign-in path" — may be structurally broken regardless of whether the operator is logged in, since `--sandbox workspace-write` or a differing profile/working directory could be hiding `~/.codex` state from the child. Test 9 ("real H01 smoke path") is satisfied only by documentation, not execution. This gap must be root-caused with an actual SUCCEEDED run before the smoke claim is credible.

## High Findings

**1. "No hidden API-key fallback" is asserted but not actually verified end-to-end.**
`tests/product/codex-subscription.test.mjs` only inspects the static `buildInvocation()` output object (`invocation.env === undefined`, no API-key string in the built args/env). It does not exercise the actual spawn path. `one-shot-process-adapter.mjs`'s `runChild` spawns with `env: { ...process.env, ...env }` — i.e., the full parent process environment is forwarded to the Codex child regardless of what `buildInvocation` returns. If the operator's shell has `OPENAI_API_KEY` set (common for anyone who also uses the OpenAI SDK) at the time `npm run gateway` is launched, that variable propagates straight through to the Codex CLI child process. Whether Codex CLI then prefers that API key over the subscription/CLI session is untested and unasserted anywhere in this submission. This is exactly the "hidden API-key fallback" the mission rules prohibit, and the current test suite would not catch it.

**2. Unauthenticated-by-default dashboard + unconfined `workspace` field = arbitrary local write access.**
`app.mjs`'s `authorized()` returns `true` whenever no token is configured (the default — `CHG_API_TOKEN` is optional), so out of the box the dashboard API has no authentication. Separately, `MissionService.create()` accepts any `workspace` string and does `path.resolve(input.workspace ?? this.defaultWorkspace)` with no check that it falls under the repo root or any allow-listed directory — and the dashboard UI explicitly invites "enter an existing absolute local directory." `GatewayRuntime`'s bounded-workspace check (CT-006) only prevents writes from *escaping* the given workspace root; it does not restrict which root can be chosen. Combined, any local process or browser tab capable of reaching `127.0.0.1:8787` can direct a real, subscription-authenticated Codex agent (in `workspace-write` sandbox mode) at an arbitrary directory on the machine — e.g. the user's Documents folder — with zero authentication prompt. This is a materially larger blast radius than running `codex` from a terminal yourself, and it is new behavior introduced by this WP, not inherited from v0.3.

## Medium Findings

**1. Enabling `openai.codex.cli` by default in `config/harnesses.example.json` combines with Finding H-2 above.** Flipping `enabled: false → true` in the *example* config (which is the config actually loaded when no `harnesses.local.json` exists) means a fresh checkout, run with no extra setup, has a live Codex adapter reachable through an unauthenticated local API. This is plausibly required for the RC0 smoke path, but the report doesn't call out the security implication or suggest mitigations (e.g., default token, or restricting example config to smoke-test usage with a documented warning).

**2. Fleet Registry asserts unverified auth/billing claims for harnesses that have no adapter and are never probed.** H02 (Claude Code), H04 (Kimi), and H07 (Google) are hardcoded with `auth_mode: "LOCAL_CLI_SESSION"` / specific `billing_mode` values despite `adapter_id: null`, `transport: "UNAVAILABLE"`, and `headless_mode: "NOT_YET_ADAPTED"`. These fields read as verified facts on the dashboard cards but are actually unconfirmed guesses about vendor CLIs that were never installed, probed, or health-checked. This risks misleading an operator making fleet decisions. Recommend `UNKNOWN_REQUIRES_REVIEW` (the documented default) until each is actually adapted and probed.

**3. `verify-public-boundary.mjs` now silently skips `.chg-tmp`.** It's consistent with `.gitignore` today, so nothing currently escapes scanning that would otherwise be committed. But it removes a defense-in-depth layer: if `.chg-tmp` is ever force-added or the ignore rule regresses, secrets placed there would no longer be caught by the MIT public-boundary scan. No description of what `.chg-tmp` actually stores (mission drafts? Codex stdout? potential prompt/response content?) was included in the submission, so the exclusion can't be fully evaluated for risk.

**4. Silent breaking change to shared `server.mjs` bind policy.** v0.3 previously allowed a non-loopback bind if `CHG_API_TOKEN` was set. The new code unconditionally throws for any non-loopback host, token or not. This is reasonable for WP02's local-only mandate, but it's a behavior change to a *shared* bootstrap file not scoped to the dashboard, and the report doesn't flag it as a compatibility change versus v0.3 — it should be called out explicitly rather than discovered by a future consumer.

## Low Findings

**1. New Windows `taskkill` timeout/fallback path is itself untested.** The bounded-wait and SIGKILL-fallback logic added to `terminateProcessTree` is a real hardening improvement (previously an unresponsive `taskkill` could hang cancellation forever), but no test simulates a hung/unresponsive `taskkill` to exercise the new 5s-timeout → `child.kill("SIGKILL")` branch. The existing "process adapter enforces timeout and confirms cancellation" test doesn't target this path specifically.

**2. `FleetRegistry.list()` spawns real `--version` probes for unadapted harnesses on every fleet request.** Each dashboard load (or `GET /api/v1/fleet` call) shells out to `claude`, `grok`, `kimi`, `python` (deepseek), `qwen`, `gemini`, and `vibe` if present on PATH. This is read-only and probably safe, but it's an unbounded, un-cached side effect of a GET request worth noting for anyone with unexpected binaries of those names on PATH.

## Required Rework

1. Commit all untracked implementation files (`app.mjs`, dashboard assets, `fleet-registry.mjs`, `mission-service.mjs`, `tests/product/*`, `docs/reports/*`) to `feat/chg-v0.4-p0-dashboard`, then re-run `npm run verify` from a clean checkout of that branch to prove it is actually reproducible.
2. Root-cause the outer-vs-nested `codex login status` discrepancy. Do not resubmit "documented/runnable" as equivalent to "proven" — produce one real, non-mocked dashboard-driven H01 run that reaches `SUCCEEDED` with a captured artifact, using the actual local Codex/ChatGPT session.
3. Add a test (or explicit documented mitigation) that proves an `OPENAI_API_KEY` present in the operator's environment does **not** get used by the spawned Codex child in place of the subscription session — closing the gap between the "no hidden fallback" claim and actual `env: {...process.env}` passthrough.
4. Either require a default `CHG_API_TOKEN` for dashboard-triggerable dispatch, or explicitly document and accept the risk that any local process reaching loopback can dispatch a real Codex agent with no prompt.
5. Confine or explicitly flag the `workspace` field: either restrict missions to paths under a configured safe root, or add a loud UI/API warning that arbitrary-path missions grant Codex real write access outside the CHG repo.
6. Downgrade H02/H04/H07 (and any other unadapted harness) fields to `UNKNOWN_REQUIRES_REVIEW` until a real adapter and health probe back the claim.

## Acceptance Evidence

- `npm run verify` output supplied shows 21/21 Node tests passing, schema/boundary/discoverability checks passing — but this ran against H01's local working tree, not the committed branch state (see Critical Finding 1), so it is not yet acceptance evidence for the branch as it exists in git.
- Mandatory test items 1–8, 10–12 are plausibly covered by the listed test files (contents reviewed directly in the packet) and their assertions look correctly targeted (8-entry registry, no-secret field scan, mocked dispatch, explicit `CAPABILITY_UNSUPPORTED`/`LOGIN_REQUIRED` paths).
- Mandatory test item 9 (real H01 smoke) and item 11 (no hidden API-key fallback) are **not** satisfied by executable evidence — both rely on assertions about a static invocation object or documentation, not a live, authenticated run.
- No independent execution was performed by this review (materials were provided via the review packet only); acceptance rests on the packet's diffs, file contents, and test output as given.

## Next Gate

WP01/WP02 may **not** advance to a browser/H01 smoke gate yet. Advancement is blocked on: (1) committing the implementation so the branch is self-contained and reproducible, and (2) resolving the outer/nested Codex auth discrepancy with a genuine, evidenced end-to-end dashboard dispatch — not a documented procedure. Once both are closed, and the hidden-API-key-fallback and unauthenticated-workspace concerns are addressed or explicitly risk-accepted by the product owner, this can proceed to a real browser-driven H01 smoke test.

VERDICT: REWORK_REQUIRED

# H02 Engineering Rereview R1

## Verdict

BLOCKED

## Resolved Findings

**High-1 — Hidden API-key fallback (RESOLVED, verified in diff).** `one-shot-process-adapter.mjs`'s `runChild` now builds `childEnv` from `{...process.env, ...env}` and deletes every name in `blockedEnv` before spawn; `adapters/codex-cli/src/index.mjs` sets `blockedEnv: ["OPENAI_API_KEY"]` on both `buildInvocation`'s runtime path and the `probe()` health-check call. This is a real code change to the actual spawn path, not just a static-object assertion, and test 12 ("Codex spawn boundary removes OPENAI_API_KEY from inherited operator environment") ran a real child process (62ms duration is consistent with an actual spawn, not a mock) and passed. Required Rework item 3 is closed.

**Medium-1 / High-2 (auth-by-default component) — Unauthenticated dashboard (RESOLVED, verified in diff).** `server.mjs` now unconditionally throws at startup both for non-loopback binds and for an empty token (`if (!token) throw new Error(...)`), removing the previous "no token configured ⇒ authorized() returns true" default-open posture entirely at the bootstrap level. Since this logic sits in a tracked file, it is directly auditable and does close the "reachable with zero authentication" gap as far as server startup is concerned.

**Medium-2 — Enabled example adapter (RESOLVED, verified in diff).** `config/harnesses.example.json` still flips `openai.codex.cli` to `enabled: true`, but combined with the server.mjs change above, a fresh checkout can no longer serve dispatch requests without an operator-supplied token. This is a coherent mitigation, not a claim resting on an untracked file.

**Medium-3 — `.chg-tmp` boundary exclusion (RESOLVED, verified in diff).** `verify-public-boundary.mjs`'s `excludedDirectories` no longer contains `.chg-tmp`; it now excludes only `node-compile-cache`, with a comment explaining the rationale. `.gitignore` also now ignores `.chg-tmp/` directly rather than relying on the scanner to skip it. Text content under `.chg-tmp` is scanned again. Matches the H01 claim exactly.

**Medium-4 — Loopback-only bind compatibility break (RESOLVED/accepted, verified in diff).** The v0.3 token-gated non-loopback bind path is gone; `server.mjs` now rejects any non-loopback host regardless of token. H01's report explicitly documents this as an intentional compatibility break rather than burying it, which is what the original finding asked for.

**Low-1 — Windows `taskkill` hang (partially addressed, verified in diff, no new test).** `terminateProcessTree` now bounds the `taskkill` wait to 5s and falls back to `child.kill("SIGKILL")`. H01 correctly discloses that no simulation test was added for this branch. Acceptable as a Low item; not a blocker.

## Unresolved Findings

**Critical-1 — Branch is still not reproducible from git (UNRESOLVED / STILL BLOCKING).** Post-rework `git status` shows `apps/gateway/public/`, `apps/gateway/src/app.mjs`, `packages/gateway-core/src/fleet-registry.mjs`, `packages/gateway-core/src/mission-service.mjs`, and `tests/product/` are still untracked (`??`). H01's explanation (`.git/index.lock: Permission denied` in this execution profile) is plausible and honestly disclosed as BLOCKED rather than misrepresented as resolved — that is a genuine improvement in reporting honesty over the original submission. But the underlying Required Rework item 1 (commit + clean-checkout verify) is not closed. This is a repo-owner action item, not something H01 can rework further from inside its sandbox.

**Critical-2 — Real, non-mocked H01 dashboard dispatch (UNRESOLVED / STILL BLOCKING, but root-caused).** H01 now root-causes the discrepancy correctly: the outer launcher's ChatGPT-authenticated session is a property of the execution service, not of the local Codex CLI profile that gateway child processes inherit; in this environment `codex login status` genuinely returns "Not logged in" with `CODEX_HOME` unset. That resolves the *inconsistency* in the original report (the two explanations are now reconciled into one true one). But Required Rework item 2 explicitly demanded a live `SUCCEEDED` run with a captured artifact — that has still not happened. Test 9 / mandatory item 9 remains satisfied only by mocked-runtime integration tests (test 14, 17, 20), not a real dispatch.

**Evidentiary gap cascading from Critical-1.** Because `app.mjs`, `mission-service.mjs`, `fleet-registry.mjs`, and all of `tests/product/` remain untracked, the "POST-REWORK DIFF" supplied for this rereview — being a `git diff` of tracked files — contains **none** of their actual source. My ability to verify the following claims is therefore limited to trusting (a) test names and pass/fail results in the `npm run verify` transcript, and (b) H01's narrative description, not independently-readable source:
- High-2's workspace-confinement half (`MissionService` rejecting paths outside `CHG_SAFE_WORKSPACE_ROOT`) — only supported by test name "mission workspace cannot escape configured safe root: PASS."
- The dashboard UI's stated write-access warning and token-in-memory-only handling — not verifiable at all from this packet (public/ assets aren't in the diff).
- Medium-2's `UNKNOWN_REQUIRES_REVIEW` downgrade for H02/H04/H07 — supported only by test names ("unadapted fleet metadata assertions: PASS," "WP01 registry loads normalized H01-H08 without secrets: PASS"), and note H01's own disposition text lists H02, H03, H04, H06, H07, H08 as now unadapted (a wider set than the original finding named), which I cannot cross-check against `fleet-registry.mjs` source.

These are plausible-and-probably-true claims given consistent test output, but they carry the same class of unauditability risk that Critical-1 was originally raised to prevent. This is not a new code defect — it is a direct, structural consequence of Critical-1 being unresolved, and should not be treated as separately "passing" evidence until the files are committed and independently reviewable.

## Regression Check

- **v0.3 compatibility:** No new regression beyond the already-flagged and now-explicitly-documented loopback/token bootstrap change (Medium-4). No other shared-file behavior changes detected in the tracked diff.
- **Local-only security:** Strengthened, not regressed — bind policy is now unconditionally loopback-only, and dispatch is now unconditionally token-gated at startup (verified in tracked `server.mjs`).
- **Secret handling:** Strengthened — `OPENAI_API_KEY` is now stripped from the Codex child environment, and the public-boundary scanner's exclusion surface was narrowed back down to a strictly binary-only subtree instead of all of `.chg-tmp`. No regression found.
- **Subscription-First behavior:** Strengthened by the `blockedEnv` mechanism; consistent with RC0's mandate. No regression found.
- **Test integrity:** Test count rose from 21 to 23 with plausible new test names covering the fixed areas; `npm run verify` output is internally consistent (schema/boundary/discoverability all PASS, 23/23 Node tests PASS). However, per the evidentiary-gap note above, the test *files* themselves are untracked and unread in this packet, so I can confirm the suite ran and passed but cannot confirm the assertions are as rigorous as their names imply.

## Acceptance Evidence

- `npm run verify` (post-rework): schema verification PASS (6 schemas), public-boundary PASS (89 text files scanned), discoverability PASS (8 entry points), Node tests PASS 23/23. This is real transcript evidence of a green run, but — as in the original review — it ran against a working tree that git status confirms is only partially tracked, so it is still not proof that a clean checkout of the branch would produce this result.
- Tracked-file diff evidence directly substantiates: High-1 (API-key blocking), Medium-1/part of High-2 (mandatory token at startup), Medium-3 (`.chg-tmp` rescanned), Medium-4 (documented loopback break), Low-1 (taskkill timeout fallback).
- No tracked-file or independently-readable evidence substantiates: workspace confinement enforcement logic, dashboard UI auth handling, or the specific fleet-metadata field values — these rest on test-name inference and H01's narrative only.
- No live H01 `SUCCEEDED` dashboard run or artifact was supplied; H01 explicitly states none exists.
- No commit or clean-checkout verification was performed or is possible in this environment per H01's report.

## Next Gate

WP01/WP02 may **not** advance to real local Dashboard + H01 one-click smoke + H03 Red Team yet. The substantive code-level rework (High-1 through Low-2) appears genuinely done and is corroborated where the tracked diff allows verification. What remains are two structural blockers that no further agent-side rework can close from inside this execution context:

1. A repository owner with `.git` write access must stage and commit `apps/gateway/src/app.mjs`, `apps/gateway/public/`, `packages/gateway-core/src/fleet-registry.mjs`, `packages/gateway-core/src/mission-service.mjs`, `tests/product/*`, and `docs/reports|reviews|work_packages/*` to `feat/chg-v0.4-p0-dashboard`, then run `npm run verify` from a genuinely clean checkout of that branch.
2. An operator must run `codex login` in the same local Windows profile/user context that the gateway's child processes inherit, then execute one real, dashboard-driven H01 mission through to a `SUCCEEDED` terminal state with a captured artifact.

Once both are done, this should be a fast confirmation pass rather than a new rework cycle — re-verify the previously-unauditable claims (workspace confinement, dashboard auth UX, fleet metadata values) against the now-committed source, and confirm the real H01 run artifact, before clearing WP01/WP02 to the browser/H01 smoke and H03 Red Team gate.

VERDICT: BLOCKED

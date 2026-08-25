# H02 Main Sync Engineering Review

## Verdict
Conditional PASS. All mandatory verification gates (schemas, Commercial Boundary, discoverability, federation, full test suite — 40/40) pass with raw output evidence attached. MAIN P2-A and FEATURE v0.4-P0 lines both survive. Two non-blocking evidentiary gaps are recorded below for the audit trail; neither indicates a dropped feature, a boundary leak, or a security regression.

## Main Preservation
| MAIN P2-A item | Evidence | Status |
|---|---|---|
| Federation Registry Runtime v0.3.0-alpha.1 | `package.json`/`config/harness-registry.v0.3.yaml` both pin `0.3.0-alpha.1`; `packages/gateway-core/src/federation-registry.mjs` added | Present |
| H01 Combat Passport / evidence-gated support state | `config/combat-passports/H01.openai-codex.v0.3-alpha.1.json` (`CONFORMANCE_PARTIAL` / `NOT_READY`); `evaluateSupportTransition` enforces adjacent-only promotion with required-evidence gates | Present |
| Durable terminal publication/persistence | `runtime.mjs` `#commitDurableState` now writes a structured-cloned snapshot to disk *before* mutating the in-memory job, and records `persistence_error` instead of silently losing state on write failure — a strict improvement over the pre-merge behavior | Present |
| Read-only federation API/CLI | `app.mjs` federation routes are all `GET`; `scripts/chg.mjs` adds `federation`/`harness`/`capabilities`/`passport` (no mutating federation commands) | Present |
| Schemas, federation verification, tests | 2 new schemas (8 total, matches `verify-schemas` output), `scripts/verify-federation-registry.mjs`, `tests/federation/*`, `tests/runtime/federation-api.test.mjs`, `tests/adapters/codex-cli-adapter.test.mjs` — all pass (P2A-001…012, H01-001…004) | Present |

## Feature Preservation
| v0.4-P0 item | Evidence | Status |
|---|---|---|
| War Room | `server.mjs` startup banner "Cogiens War Room / Harness Gateway v…"; dashboard routes in `app.mjs` untouched by this diff (pre-existing, not removed) | Present |
| Fleet Registry | `FleetRegistry` import + `/api/v1/fleet` untouched by diff; test 29 "fleet endpoint returns eight entries and dashboard renders API data" passes | Present |
| MissionService | `MissionService` import + `/api/v1/missions*` untouched; tests 30, 33 pass | Present |
| One-click H01 dispatch | Test 30 "mission API creates and dispatches H01 through mocked runtime", test 33 "mission creation preserves fleet selection and mocked dispatch accepts H01" | Present |
| Subscription-First behavior | Indirect only: `authModes: ["provider-login", "api-key", "oauth"]` (provider-login/subscription first) and OPENAI_API_KEY blocking. No test or doc explicitly names "Subscription-First." | **Weak evidence — see Remaining Findings** |
| Current Codex 0.149.0 invocation | Test title "H01-002 invocation uses Codex 0.149.0 global approval config…" passes | Present, but see note below |
| No hidden OPENAI_API_KEY fallback | Tests "H01 uses non-interactive codex exec stdin and has no API-key fallback" and "Codex spawn boundary removes OPENAI_API_KEY from inherited operator environment" pass; `blockedEnv: ["OPENAI_API_KEY"]` unchanged by this diff (preserved, not newly introduced) | Present |
| Safe workspace root | `server.mjs` `safeWorkspaceRoot`; CT-006 and "mission workspace cannot escape configured safe root" pass | Present |
| Bearer-protected operational APIs | `app.mjs`: all routes except static dashboard shell (`/`, `/dashboard`, `/dashboard.js`, `/dashboard.css`) require `authorized(request, token)`, including the new federation routes | Present |
| Loopback-only dashboard | `server.mjs` `isLoopback()` guard throws unless host is `127.0.0.1`/`::1`/`localhost` (unchanged by diff) | Present |
| Fail-closed unsupported harness behavior | CT-008 "unsupported capability fails explicitly", "unadapted fleet dispatch fails explicitly" pass; P2A-004 confirms H02-H08 default to `UNKNOWN` capability state | Present |

## Commercial Boundary Audit
- `verify:boundary` → **PASS**, 103 text files scanned, "Commercial Boundary Gate policy present."
- README.md / README.zh-CN.md both explicitly reaffirm "**Open CHG, not Cogiens**" language, and the last three commits in the log (`7067218`, `5198d4b`, `dc0e5e8`, `51496f3`) are dedicated to reinforcing this boundary statement bilingually.
- Reviewed all added/changed content (Federation Registry, Combat Passport, docs, schemas, tests): no pricing, revenue, settlement, private-memory/decision logic, customer data, private topology, or proprietary operational workflow found. `P2A_RELEASE_REPORT.md` and `docs/COMBAT_PASSPORTS.md` are evidence/methodology documents, not commercial workflow.
- ROADMAP.md's "P3 — Cogiens integration / CGS-MEM project identity" is forward-looking roadmap text describing a future external integration point, not an implementation — consistent with the boundary.
- **No boundary leak detected.**

## Security Regression Audit
- No credentials, tokens, or session material in the diff (`MANIFEST.sha256` is hashes only; `verify-schemas`/`verify-boundary`/dedicated test "P2A-011 public evidence contains no credential values" and "CT-007 secret-like prompt material is not reflected into events" all pass).
- OPENAI_API_KEY exclusion from the child-process environment is unchanged/preserved by this merge, not newly introduced — no weakening.
- Bearer-auth gate order in `app.mjs` places all new federation endpoints behind the same `authorized()` check as existing operational APIs — no new unauthenticated surface.
- `#commitDurableState` in `runtime.mjs` strictly hardens persistence (writes durable snapshot before mutating in-memory state, captures persistence failures instead of masking them) — a fix, not a regression.
- No change to loopback binding, workspace-root enforcement, or fail-closed capability defaults.
- **No security regression identified.**

## Verification Evidence
```
verify:schemas    PASS — 8 schemas parsed with unique IDs
verify:boundary   PASS — 103 text files scanned; Commercial Boundary Gate policy present
verify:discoverability PASS — 8 canonical entry points and social preview verified
verify:federation PASS — 8 first-class targets; H01 partial only; H02-H08 unverified
test              PASS — 40/40 (0 fail, 0 cancelled, 0 skipped)
```
Raw git status shows a clean staged change set (M/A only, no `UU`/`AA` unmerged-path markers) — consistent with all conflicts having been resolved and added to the index. No conflict markers (`<<<<<<<`/`=======`/`>>>>>>>`) appear anywhere in the supplied staged diff.

## Remaining Findings
1. **Merge commit not yet finalized in the shown log.** `RAW GIT LOG` lists only single-parent feature-branch commits ending at `7559873`; the staged diff/status represent an in-progress merge (`MERGE_HEAD` present, changes staged but not committed). This is expected for a pre-commit gate checkpoint, not a defect — but the audit trail is incomplete until a merge commit exists. **Recommendation:** after this gate clears, capture `git log --graph --oneline -1` and `git show HEAD --stat` on the finalized merge commit as a follow-up record.
2. **"Subscription-First" is not directly evidenced.** Only inferable indirectly from `authModes` ordering and the OPENAI_API_KEY block; no test or doc names this behavior explicitly. **Recommendation:** add an explicit test/doc line naming Subscription-First dispatch precedence so this claim is independently checkable in future gates.
3. **"Codex 0.149.0" is asserted only in a test title**, not enforced by any runtime version pin — consistent with the Combat Passport's own honest disclosure (`upstream_version: "NOT_PINNED"`, evidence item `NOT_OBSERVED`). Not a defect (evidence-gating is working as intended), but flag it in the release report so "0.149.0" is not misread as a certified/pinned version.

None of the above block this gate.

## Next Gate
Proceed to finalize the merge commit, then re-run `npm run verify` on the committed HEAD (not just staged tree) and capture the resulting `git log --graph` for the permanent audit record before promoting past CHG v0.4-P0.

VERDICT: PASS

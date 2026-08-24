# WP01/WP02 Codex Rework R1.1

## Scope and disposition

This targeted source rework addresses every repository-fixable item from the H02 R1 rereview and the three additional objective findings. It does not claim that repository ownership or an operator-authenticated live run can be completed from this sandbox.

## H02 unresolved items

### Critical-1 — reproducibility from git

The previously unauditable dashboard, mission, fleet, and product-test sources are present in the working tree and were inspected and exercised by `npm run verify`. They remain reported by git as untracked because this execution profile does not grant `.git` write access. No commit or clean-checkout result is claimed. Repository-owner staging, commit, and clean-checkout verification remain the external gate.

Source-level evidence now exercised by the suite includes:

- `MissionService` safe-root confinement, including rejection of an escaping workspace.
- Dashboard static shell and assets, bearer-protected APIs, and in-memory-only token handling.
- Fleet normalization and explicit unsupported-harness failure.
- Real child-process removal of inherited `OPENAI_API_KEY`.

### Critical-2 — real dashboard-driven H01 success

The source path is implemented and covered through dashboard/API integration with a mocked runtime, but no live `SUCCEEDED` H01 run or artifact is claimed. The installed CLI is `codex-cli 0.149.0`; a live run still requires `codex login` in the Windows profile inherited by the gateway child process, plus a gitignored `config/harnesses.local.json` that explicitly enables H01. This remains an operator acceptance action rather than a source defect.

### Cascading evidentiary gap

The source-level claims are locally readable and verified in this working tree. They cannot become clean-checkout evidence until the repository owner tracks the untracked implementation and test files identified by H02.

## Objective source fixes

### Public example does not enable a real harness

`config/harnesses.example.json` now keeps `openai.codex.cli` disabled. A regression test parses the public example and asserts the adapter is present and disabled. Real acceptance must use gitignored `config/harnesses.local.json`.

### Browser authentication bootstrap

The loopback dashboard shell, JavaScript, and CSS remain available without an Authorization header so a normal browser can bootstrap. Authentication is checked before every operational route, including health, adapters, fleet, missions, dispatch, runs/events, jobs, and cancellation.

The product test proves that:

- the shell and both static assets return 200 without bearer authentication;
- the fleet API returns 401 without a bearer token when a token is configured;
- the same protected endpoint returns 200 with the valid bearer token;
- dashboard source contains no `localStorage`, `sessionStorage`, IndexedDB, or cookie persistence path.

The token is read directly from the password input for each API request and remains page-memory/DOM state only.

### Codex CLI 0.149.0 invocation contract

`codex exec --help` for the installed 0.149.0 CLI does not expose `--ask-for-approval`. The adapter now supplies `-c approval_policy="never"` before `exec`, while retaining JSONL output, ephemeral execution, `workspace-write` sandboxing, stdin prompt input, working-directory confinement, and the local Codex login path. The test asserts the global override ordering and rejects any `--ask-for-approval` regression.

## Preserved gates

- No second gateway was introduced; v0.3 runtime and adapter boundaries remain intact.
- The Codex spawn and login probe both strip `OPENAI_API_KEY` from inherited environment state.
- Workspace safe-root confinement remains enforced.
- Unsupported harnesses fail explicitly.
- Public-boundary scanning remains enabled for `.chg-tmp` text content.
- Loopback-only binding and mandatory startup token remain unchanged.
- No production configuration, credentials, provider sessions, customer data, or commercial modules were added.

## Verification

`npm run verify` is the required final command. The final R1.1 run result is recorded in the handoff response; no clean-checkout equivalence is claimed while Critical-1 remains externally blocked.

RESUBMITTED_FOR_FINAL_ENGINEERING_REVIEW

# CGS-HARNESS-GATE-001 v0.4-P0
## WP01 + WP02 — Codex Lead Implementation Mission

Canonical repo:
D:\FND\CogiensCommand\01_PROGRAMS\CGS-HARNESS-GATE-001\src\cogiens-harness-gateway

Required branch:
feat/chg-v0.4-p0-dashboard

Baseline:
72d193520671780fdf2300a5ba381f9b604b9432

Goal:
Build the first real CHG product surface:
Fleet Registry + Subscription-First Auth + Local Joint Command Dashboard.

Product theorem:
ONE COMMAND IN -> JOINT RESULT OUT.

Rules:
- Inspect and reuse existing v0.3 code first. Do not create a second gateway.
- Local-only first: bind to 127.0.0.1.
- No Production access or deployment.
- No hidden API billing fallback.
- Reuse supported local subscription/OAuth/CLI sessions where possible.
- Never print or persist tokens/secrets.
- Do not merge to main.
- Finish at SUBMITTED_FOR_REVIEW.

WP01 Fleet Registry:
Support H01-H08:
H01 OpenAI Codex
H02 Anthropic Claude Code
H03 xAI Grok
H04 Moonshot Kimi Code
H05 DeepSeek Harness
H06 Qwen Code
H07 Google
H08 Mistral Vibe

Normalized fields:
harness_id
canonical_name
vendor
executable
installed
version
auth_mode
auth_health
billing_mode
subscription_reused
api_key_required
headless_mode
transport
capabilities
current_account_if_safely_exposed
quota_if_exposed
last_verified_at
last_error

Billing modes:
SUBSCRIPTION_INCLUDED
FIXED_CODING_PLAN
ENTERPRISE_SEAT
API_USAGE
FREE_QUOTA
LOCAL_COMPUTE
UNKNOWN_REQUIRES_REVIEW

WP02 Dashboard:
- War Room
- Fleet cards H01-H08 from API/registry, not hard-coded HTML
- Project/Campaign/Mission
- Mission editor
- Fleet selection
- Role assignment
- DEPLOY MISSION
- Campaign state
- Result/Artifact panel
- Decision Center placeholder

Prefer existing API endpoints if equivalent ones exist.
Otherwise use a minimal normalized API:
GET  /api/v1/fleet
POST /api/v1/missions
POST /api/v1/missions/{mission_id}/dispatch
GET  /api/v1/runs/{run_id}
GET  /api/v1/runs/{run_id}/events

RC0 hard requirement:
H01 Codex must receive a mission non-interactively from the dashboard using the existing local Codex/ChatGPT sign-in path; do not require the user to copy/paste the prompt and do not require an OpenAI API key merely for this path.

Mandatory tests:
1. registry loads H01-H08
2. fleet endpoint returns 8 entries
3. auth/billing fields are present without secrets
4. dashboard renders all 8 cards from API data
5. mission creation works
6. fleet selection works
7. dispatch service accepts H01
8. mocked adapter dispatch test
9. real H01 smoke path is documented/runnable
10. missing/login-required Codex failure is explicit
11. no hidden API-key fallback
12. existing v0.3 tests remain green

Deliverable report:
docs/reports/WP01_WP02_CODEX_SUBMISSION.md

The report must include:
architecture reused
files changed
API endpoints
H01 dispatch mechanism
subscription/auth behavior
tests/results
dashboard start command
H01 one-click smoke procedure
known limitations
remaining H02-H08 work
no-production attestation

Final state:
SUBMITTED_FOR_REVIEW

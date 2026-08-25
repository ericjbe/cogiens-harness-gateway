# Combat Passports and Federation Status

`v0.3.0-alpha.1` makes federation support claims evidence-bound. A Combat Passport is a public, machine-readable record of what was verified, what is limited, what was not observed, and what still blocks promotion.

## Two independent state axes

CHG deliberately separates product-wide integration maturity from machine-local deployment state.

### Integration support status

`DECLARED_UNVERIFIED` → `CONFORMANCE_PARTIAL` → `CONFORMANCE_VERIFIED` → `PRODUCTION_CANDIDATE` → `PRODUCTION_CERTIFIED`

`BLOCKED` and `DEPRECATED` are explicit non-promotion states. Promotions must be adjacent and must satisfy the required verified evidence. A registry entry cannot become certified merely because one contributor installed or logged in to a CLI.

### Local deployment status

`NOT_PROBED`, `NOT_DISCOVERED`, `DISCOVERED`, `AUTH_REQUIRED`, `AUTHENTICATED`, `HEALTHY`, `UNHEALTHY`, or `BLOCKED`.

These values describe one deployment. P2-A records only the public default `NOT_PROBED`; future local discovery may project results without changing the global support status.

## Capability states

- `SUPPORTED`: public evidence covers the declared adapter behavior.
- `LIMITED`: an implementation exists with recorded constraints or missing live evidence.
- `UNSUPPORTED`: the adapter fails explicitly rather than approximating the capability.
- `UNKNOWN`: no support statement has earned sufficient evidence.

## P2-A promotion gates

| Target status | Minimum verified evidence |
|---|---|
| `CONFORMANCE_PARTIAL` | official source, headless interface, structured output, adapter unit tests |
| `CONFORMANCE_VERIFIED` | conformance suite, platform matrix, cancellation, artifacts, trace |
| `PRODUCTION_CANDIDATE` | security review, sandbox/worktree, upgrade and rollback |
| `PRODUCTION_CERTIFIED` | external maintainer review, operational owner, SLA boundary |

The runtime rejects skipped levels. Moving to `BLOCKED` requires a reason; deprecation requires a published notice.

## H01 status in this alpha

OpenAI Codex is `CONFORMANCE_PARTIAL` and its Combat Passport remains `NOT_READY`. Official documentation and repository unit tests support the non-interactive JSON interface claim. The release builder did not contain a Codex executable, provider login, pinned upstream version, or a live platform matrix. No credential, account session, or provider software is included.

H02-H08 remain `DECLARED_UNVERIFIED` with `UNKNOWN` capabilities. `FIRST_CLASS` means roadmap priority only.

## Contributor route

Improve a passport by adding reproducible evidence, tests, platform details, and limitations. Never commit credentials, provider session stores, customer workspaces, screenshots containing tokens, or unverifiable marketing claims. Evidence changes should be reviewed like code and must pass `npm run verify`.

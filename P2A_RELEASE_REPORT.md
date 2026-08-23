# P2-A Release Report — v0.3.0-alpha.1

Release scope: Federation Registry Runtime

## Implemented

- Zero-new-dependency loader for the JSON-compatible YAML 1.2 registry
- Eight first-class Harness identities plus Hermes auxiliary compatibility path
- Explicit `SUPPORTED`, `LIMITED`, `UNSUPPORTED`, and `UNKNOWN` capability states
- Separate global integration support and machine-local deployment state axes
- Evidence-gated, adjacent-only support promotion rules
- H01 OpenAI Codex Combat Passport and adapter-level invocation/parser tests
- Read-only federation HTTP routes and CLI commands
- Two public JSON Schemas and a dedicated Registry verification gate
- Backward-compatible v0.2 Job/Run fan-out runtime
- Durable terminal-state publication so API completion cannot race the final on-disk Job snapshot

## Evidence boundary

H01 is `CONFORMANCE_PARTIAL` with Passport `NOT_READY`. The official non-interactive JSON interface and repository adapter tests are verified. No executable, provider login, pinned upstream version, live platform matrix, credential, or production certification is included.

H02-H08 remain `DECLARED_UNVERIFIED`. `FIRST_CLASS` remains an architecture-priority label only.

## Verification target

- Public schemas: 8
- Automated tests: 30
- Runtime dependencies added: 0
- Public boundary findings: 0
- Federation gate: PASS

The authoritative CI result is the GitHub Actions run attached to the release pull request.

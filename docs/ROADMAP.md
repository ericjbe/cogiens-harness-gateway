# Roadmap

## P0 — Public contract bootstrap

MIT public repository, governance, schemas, Mock Adapter, and conformance gates.

## P0.1 — Discoverability and contributor entry points

Canonical English and Chinese definitions, FAQ answer targets, machine-readable navigation and citation metadata, adapter catalog, contributor routes, Digital Job Pack proposal template, and discoverability verification gate.

In parallel, collect at least three concrete Digital Job Pack proposals before freezing a portable role contract.

## P1 — Local deployment candidate

Local HTTP control plane, bounded multi-harness fan-out, real one-shot process adapters for Codex CLI and Hermes CLI, a DeepSeek Harness Python SDK bridge, Windows/WSL2 scripts, preflight, cancellation, and artifact evidence.

## P1.1 — Production Codex app-server adapter

Pinned official interface, stdio lifecycle mapping, isolated worktree Runner, approval and cancellation evidence.

## v0.3 architecture preview — Eight-Harness Federation

The `v0.3.0-architecture-freeze` preview defines an extensible Registry, Capability model, Combat Passport evidence gate, isolated worktrees, artifact intake, joint review workflow, and telemetry boundary. Its first-class architecture cohort is Codex, Claude Code, Grok Build, Kimi Code, DeepSeek Harness, Qwen Code, Google Antigravity CLI, and Mistral Vibe.

The architecture preview itself was not an implementation claim. `v0.3.0-alpha.1` now implements only the P2-A Registry slice; the v0.2 fan-out runtime remains the compatibility baseline.

## P2-A — Federation registry runtime (`v0.3.0-alpha.1`)

Implemented: zero-dependency registry loader, capability model, separate integration/deployment states, evidence-gated support transitions, read-only HTTP/CLI projection, and the H01 Codex Combat Passport. H01 is `CONFORMANCE_PARTIAL` and `NOT_READY`; H02-H08 remain `DECLARED_UNVERIFIED`.

Still open: live local discovery projection, passport signing/provenance, H02-H08 evidence records, and any production certification.

## P2.1 — Isolation and artifact intake

Give every Run an independent sandbox or worktree, normalize diffs, tests, logs, artifacts, SHA-256 evidence, limitations, usage, and cost data.

## P2.2 — Evidence-bound native adapters

Advance H01-H08 one adapter at a time. Each adapter requires an official structured interface, pinned upstream version, authentication boundary, cancellation evidence, platform matrix, conformance results, and public maintainer ownership.

## P2.3 — Joint review workflow

Implement submission, collaborator review, red team, rework, integration, acceptance, and operator freeze without converting failed or unsupported Runs into success.

## P3 — Cogiens integration

Developer and operator consoles, Trace binding, CGS-MEM project identity, and usage ledger.

## P4 — Internal dogfood and security review

Real project evaluation, fault injection, permission testing, upgrade and rollback exercises, and provider license matrix.

## P5 — Stable Community release and hosted preview gate

Stable Community Edition, external onboarding evidence, documentation, and a separately approved hosted-service preview.

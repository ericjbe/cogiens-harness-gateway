# Cogiens Harness Gateway (CHG)

> **The open-source interoperability, routing, and governance layer for AI agent harnesses.**

[![CI](https://github.com/ericjbe/cogiens-harness-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/ericjbe/cogiens-harness-gateway/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-EB6100.svg)](CONTRIBUTING.md)

[English](README.md) · [简体中文](README.zh-CN.md) · [Open Source Boundary](OPEN_SOURCE_BOUNDARY.md) · [v0.3 Architecture Preview](docs/rfcs/0001-eight-harness-federation.md) · [Deploy](docs/DEPLOYMENT.zh-CN.md) · [FAQ](docs/FAQ.md) · [Build an adapter](docs/BUILD_AN_ADAPTER.md) · [Roadmap](docs/ROADMAP.md)

**Cogiens Harness Gateway is an MIT-licensed, vendor-neutral gateway that lets one application discover, invoke, observe, approve, cancel, and audit multiple stateful AI agent harnesses through one Adapter Contract.**

**Open CHG, not Cogiens.** This repository contains only the CHG public core. The Cogiens Business System and proprietary commercial implementations are closed source and are not part of this repository. A public API, schema, SDK, or integration point does not imply that the implementation behind it is open source. See [OPEN_SOURCE_BOUNDARY.md](OPEN_SOURCE_BOUNDARY.md).

Use CHG when your product must coordinate different agent runtimes—such as coding harnesses, research harnesses, or enterprise agent systems—without hard-coding every provider's session model, event format, approval flow, cancellation behavior, and artifact handling.

Canonical repository: [github.com/ericjbe/cogiens-harness-gateway](https://github.com/ericjbe/cogiens-harness-gateway)

## Why CHG exists

AI models are becoming interchangeable. Agent harnesses are not.

A harness owns stateful execution: sessions, tools, files, approvals, steering, cancellation, artifacts, and evidence. Each harness exposes these capabilities differently. CHG creates a provider-neutral control boundary without pretending every harness supports the same features.

### CHG is not another model API router

| Model API router | Cogiens Harness Gateway |
|---|---|
| Selects an inference endpoint | Selects and governs a stateful agent harness |
| Routes prompts and model responses | Coordinates sessions, runs, events, approvals, cancellation, and artifacts |
| Usually treats calls as stateless requests | Preserves Job, Run, Session, Trace, and workspace identity |
| Optimizes provider, model, latency, or price | Normalizes capabilities, policy, evidence, and lifecycle control |
| Returns text or structured model output | Produces auditable event streams and integrity-bound artifacts |

Model routers and CHG can be used together. One chooses a model endpoint; the other governs the harness executing consequential work.

## What you can build

- **One control plane for many harnesses:** connect a UI, API, or operator console to heterogeneous agent runtimes.
- **Auditable agent execution:** bind events and SHA-256 artifacts to Job, Run, Session, Project, and Trace identities.
- **Safe approval workflows:** fail closed on consequential actions, missing approval, unsupported capabilities, or unconfirmed cancellation.
- **Harness comparison and evaluation:** run the same Job through multiple adapters while preserving provider-native behavior.
- **Community adapters:** implement the public Adapter Contract without moving vendor-specific logic into the Gateway core.
- **Future Digital Job Pack standards:** participate in the open RFC for portable job definitions that can run across compatible harnesses. Proprietary job implementations remain outside the public core unless separately approved for MIT publication.

## Current status

`v0.2.0` adds a local-first deployment candidate to the verified P0 public core. It is runnable, but it is not a production hosted service or a production certification claim. `v0.3.0-architecture-freeze` is a documentation-only public preview of the proposed Eight-Harness Federation; the implemented runtime remains v0.2.

| Component | Status |
|---|---|
| Adapter Contract v0.1 | Available |
| JSON Schemas | Available |
| Adapter SDK primitives | Available |
| In-memory Mock Adapter | Conformance verified |
| Local HTTP control plane and bounded parallel fan-out | Deployment candidate |
| Codex CLI one-shot adapter | Candidate; requires installed and authenticated CLI |
| Hermes CLI one-shot adapter | Candidate; requires installed and configured CLI |
| DeepSeek Harness Python SDK adapter | Candidate on SDK-supported Linux/macOS; WSL2 recommended on Windows |
| Eight-Harness Federation RFC | Architecture frozen for public review; not implemented |
| Adapter Contract v0.3 | Draft for review; v0.1 remains normative |
| Harness Registry v0.3 | Architecture data only; every H01-H08 target is `DECLARED_UNVERIFIED` |
| Linux and Windows CI on Node.js 20/22 | Passing |
| Production-certified vendor adapters | Planned; not yet released |
| Portable Digital Job Pack contract | Open design track; not yet stable |
| Hosted, enterprise, and proprietary Cogiens systems | Outside this repository and outside the CHG MIT public core |

### Adapter catalog

| Harness / adapter | Stage | Evidence |
|---|---|---|
| In-memory Mock Harness | P0 reference | Conformance suite included |
| OpenAI Codex CLI | P1 deployment candidate | Official `codex exec --json` one-shot interface |
| Nous Hermes CLI | P1 deployment candidate | Official `hermes chat --query-file -` one-shot interface |
| Grok-compatible harness | Research track | Official headless interface required |
| Qwen-compatible harness | Research track | ACP or official structured interface required |
| DeepSeek Harness Python SDK | P1 deployment candidate | Published SDK/JSON-RPC runtime; no Windows-native claim |

The names above identify integration targets only. CHG is not affiliated with or endorsed by their respective vendors. See the [Adapter Catalog](docs/ADAPTER_CATALOG.md) for acceptance rules.

### v0.3 Eight-Harness Federation architecture preview

The public architecture cohort is OpenAI Codex, Anthropic Claude Code, xAI Grok Build, Moonshot Kimi Code, DeepSeek Harness, Qwen Code, Google Antigravity CLI, and Mistral Vibe. These are first-class **architecture targets**, not current support claims. Every target begins as `DECLARED_UNVERIFIED` and must earn a public Combat Passport before support can advance.

This makes CHG a proposed multi-harness orchestration and AI agent harness interoperability layer—not a model router and not a claim that eight vendor runtimes already work. Review the [English RFC](docs/rfcs/0001-eight-harness-federation.md), [Chinese summary](docs/rfcs/0001-eight-harness-federation.zh-CN.md), [draft v0.3 Adapter Contract](docs/contracts/adapter-contract.v0.3-draft.md), [registry](config/harness-registry.v0.3.yaml), and [migration plan](docs/migrations/v0.2-to-v0.3.md).

## Quick start

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/ericjbe/cogiens-harness-gateway.git
cd cogiens-harness-gateway
npm run verify
npm run example:mock
```

To deploy the real local gateway on Windows or WSL2, follow the [deployment guide](docs/DEPLOYMENT.zh-CN.md). The Gateway itself has no npm runtime dependencies; vendor harnesses remain separately installed and authenticated.

Expected verification gates include schema validation, public-boundary verification, discoverability checks, and the test suite.

## Build a harness adapter

An adapter implements lifecycle operations such as:

```ts
describe()
health()
createSession()
startRun()
decideApproval()
cancel()
collectArtifacts()
close()
```

Capabilities must be detected and declared. Unsupported behavior must fail explicitly; an adapter may never simulate support silently.

Start with the [20-minute adapter guide](docs/BUILD_AN_ADAPTER.md), inspect the [Mock Adapter](adapters/mock/src/index.mjs), and run the [conformance suite](tests/conformance/mock-adapter.test.mjs).

## Build a Digital Job Pack standard

The open design track may define a portable format for bounded jobs across compatible harnesses. The public format may describe manifests, inputs, permissions, evidence, and tests.

That does **not** make proprietary Cogiens job implementations, commercial prompts, workflow packs, or internal operating logic part of the CHG public core. Those remain outside this repository unless explicitly approved for unrestricted MIT publication.

Read [Digital Job Packs](docs/DIGITAL_JOB_PACKS.md) and open a Job Pack proposal to help define the public portable contract.

[Propose a Digital Job Pack](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=digital-job-pack.yml) · [Propose a Harness Adapter](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=adapter.yml) · [Find a first contribution](https://github.com/ericjbe/cogiens-harness-gateway/contribute)

## Architecture principles

1. **Vendor-neutral core, vendor-specific adapters.**
2. **Job, Run, and native Session are different identities.**
3. **Capability negotiation is explicit and fail-closed.**
4. **Approvals, cancellation, isolation, and artifact evidence are acceptance gates.**
5. **Credential references are allowed; plaintext credentials are not.**
6. **Open CHG, not Cogiens: public interoperability infrastructure and proprietary commercial systems remain separate.**

## Repository map

```text
adapters/mock/            Reference in-memory adapter
adapters/*-cli/           Candidate real harness adapters
apps/gateway/             Local HTTP control plane
config/                   Adapter registry and safe defaults
deploy/                   Windows and WSL2 lifecycle scripts
docs/                     Contract, architecture, security, FAQ, and author guides
examples/                 Runnable examples
packages/adapter-sdk/     Adapter validation and event primitives
packages/conformance-kit/ Shared conformance assertions
packages/gateway-core/    Fan-out orchestration and persistence
schemas/                  Provider-neutral JSON Schemas
scripts/                  Verification gates
tests/conformance/        Adapter conformance tests
```

## Frequently asked questions

### What is an AI agent harness?

An AI agent harness is the runtime around a model that manages tools, files, sessions, approvals, execution state, and artifacts. A model generates outputs; a harness turns those outputs into controlled work.

### Is CHG the same as OpenRouter?

No. A model router such as an inference-routing service selects model endpoints. CHG is a harness interoperability and governance layer for stateful agent execution. The two categories can complement each other.

### Which harnesses work today?

P0 ships the verified Mock Adapter. v0.2 adds candidate one-shot adapters for Codex CLI, Hermes CLI, and the published DeepSeek Harness Python SDK. They run only after local preflight passes, and they are not yet production-certified. Grok and Qwen can be selected as Hermes model providers where Hermes supports them; that is not the same as an independent Grok or Qwen harness adapter.

### Can I use CHG commercially?

Yes. The public-core files covered by [LICENSE](LICENSE) are MIT licensed and permit commercial use. That permission does not extend to Cogiens proprietary systems, hosted services, commercial implementations, trademarks, certification, support, or other rights outside this repository. See [OPEN_SOURCE_BOUNDARY.md](OPEN_SOURCE_BOUNDARY.md) and [COMMERCIAL.md](COMMERCIAL.md).

### How can I contribute?

Start with [CONTRIBUTING.md](CONTRIBUTING.md), choose a `good first issue`, propose an adapter, improve a conformance test, or join a public contract RFC. Contributions require DCO sign-off and must pass the Commercial Boundary Gate.

More answers: [docs/FAQ.md](docs/FAQ.md)

## Star, watch, and contribute

If CHG solves a real interoperability problem for you:

1. **Star** the repository so demand for an open harness interoperability layer is visible.
2. **Watch** releases if you want adapter and contract updates.
3. **Open an issue** naming the harness or public interoperability feature you need.
4. **Submit a PR** with tests, evidence, and Commercial Boundary attestation.

A star is not the product. Working adapters, conformance evidence, stable contracts, and an active contributor community are the public-core product.

## Licensing, security, and commercial boundary

- Public-core boundary: [OPEN_SOURCE_BOUNDARY.md](OPEN_SOURCE_BOUNDARY.md)
- Public core license: [MIT License](LICENSE)
- Contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security reporting: [SECURITY.md](SECURITY.md)
- Governance: [GOVERNANCE.md](GOVERNANCE.md)
- Commercial boundary: [COMMERCIAL.md](COMMERCIAL.md)
- Trademark policy: [TRADEMARKS.md](TRADEMARKS.md)
- Citation metadata: [CITATION.cff](CITATION.cff)

Do not open a public issue for vulnerabilities that expose credentials, customer code, or a working exploit. Follow [SECURITY.md](SECURITY.md).

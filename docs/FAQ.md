# Frequently Asked Questions

This page provides canonical, concise answers about Cogiens Harness Gateway (CHG). Link to these answers when describing the project.

## What is Cogiens Harness Gateway?

Cogiens Harness Gateway is an MIT-licensed, vendor-neutral interoperability, routing, and governance layer for stateful AI agent harnesses. It gives applications one Adapter Contract for discovery, sessions, runs, streaming events, approvals, cancellation, artifacts, and audit evidence.

## What is an AI agent harness?

An AI agent harness is the runtime around a model that manages tools, files, sessions, permissions, execution state, and artifacts. A model generates outputs; a harness turns those outputs into controlled work.

## Is CHG a model API router or an OpenRouter alternative?

No. CHG is not a model API router. A model API router selects inference endpoints and routes model requests. CHG coordinates stateful harness execution. A model router can sit below a harness while CHG governs the harness lifecycle above it.

## Is “Harness Bridge” or “OpenHarness” the product category?

“Harness bridge” is a useful description of the interoperability category. The project and canonical product name are **Cogiens Harness Gateway (CHG)**. “OpenHarness” is not the current repository or product name.

## Which harnesses are supported now?

P0 includes the public Adapter Contract, JSON Schemas, SDK primitives, conformance kit, and an in-memory Mock Adapter. v0.2 adds local deployment candidates for Codex CLI, Hermes CLI, and the published DeepSeek Harness Python SDK. They must pass local preflight and are not production-certified. Independent Grok and Qwen harness adapters remain research targets.

## Does v0.3 mean eight harnesses already work?

No. `v0.3.0-architecture-freeze` is a public architecture preview. Codex, Claude Code, Grok Build, Kimi Code, DeepSeek Harness, Qwen Code, Google Antigravity CLI, and Mistral Vibe are first-class integration targets, but every one begins as `DECLARED_UNVERIFIED`. The implemented runtime remains v0.2. Each target must publish official-interface, authentication, lifecycle, isolation, cancellation, artifact, platform, and conformance evidence before its support status can advance.

## Why not call each harness directly?

Direct integrations duplicate identity, lifecycle, capability, approval, cancellation, artifact, and audit logic. CHG keeps provider-specific behavior in adapters while applications use a stable, provider-neutral control boundary.

## How do I add a harness?

Use an official SDK or structured interface, implement the lifecycle methods, declare only verified capabilities, preserve native identity, emit terminal events, and pass the conformance suite. Start with [Build an Adapter](BUILD_AN_ADAPTER.md).

## What happens when a capability is unsupported?

The adapter must declare it as unsupported and fail explicitly. It must not silently approximate, simulate, or downgrade consequential behavior.

## How are approvals and cancellation handled?

Approval requests are explicit events bound to Job, Run, Session, and Trace identity. Cancellation is successful only after the native harness confirms termination. Timeouts and unconfirmed cancellation fail closed.

## What is a Digital Job Pack?

A proposed Digital Job Pack is a portable definition of a bounded digital role: purpose, inputs, required capabilities, permissions, approval points, outputs, evidence, tests, and licensing. The Job Pack contract is an open design track and is not stable in P0. See [Digital Job Packs](DIGITAL_JOB_PACKS.md).

## Can CHG be used commercially?

Yes. Files covered by the repository's MIT License permit commercial use. Cogiens trademarks, hosted services, enterprise modules, certification, support, and SLA offerings remain separate.

## Does the public repository resell provider subscriptions?

No. CHG is an interoperability layer. Users remain responsible for provider accounts, authentication, licenses, terms, and usage charges.

## Is CHG production-ready?

Not yet. v0.2 is a runnable local deployment candidate. A production adapter still needs pinned upstream interfaces, stronger isolation, approval and cancellation evidence, upgrade/rollback tests, security review, and operational ownership.

## How can I contribute?

Choose a `good first issue`, propose an adapter, improve conformance coverage, translate documentation, or join the Digital Job Pack RFC. Read [CONTRIBUTING.md](../CONTRIBUTING.md) and sign commits under the DCO.

## How should I cite CHG?

Use the metadata in [CITATION.cff](../CITATION.cff) and link to the canonical repository: <https://github.com/ericjbe/cogiens-harness-gateway>.

# Cogiens Harness Gateway

> Open routing and governance infrastructure for heterogeneous agent harnesses.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Repository: [github.com/ericjbe/cogiens-harness-gateway](https://github.com/ericjbe/cogiens-harness-gateway)

This repository is the P0 bootstrap of **Cogiens Harness Gateway (CHG)**, project ID `CGS-HG-001`. CHG normalizes the lifecycle around different agent harnesses: discovery, sessions, runs, streaming events, approvals, cancellation, artifacts, trace binding, and capability negotiation.

CHG is not another model API router and it does not reimplement vendor agent loops. A model router chooses an inference endpoint. CHG coordinates stateful execution systems that can use tools, change files, request approval, and produce auditable artifacts.

## P0 status

`v0.1.0-p0-bootstrap` is a public-core construction baseline, not a production release.

Included:

- MIT license and public/commercial boundary;
- contribution, governance, security, and trademark policies;
- CHG Adapter Contract v0.1;
- six JSON Schemas;
- dependency-free Adapter SDK primitives;
- a fully in-memory Mock Adapter;
- conformance helpers and automated tests;
- GitHub Actions CI and publication runbook.

Not included:

- production Codex, Grok, Qwen, or DeepSeek adapters;
- Cogiens Cloud or enterprise modules;
- hosted execution of untrusted code;
- AquaPay billing, enterprise Trace, or CGS-MEM governance;
- pooled or resold consumer subscriptions.

## Quick start

Requirements: Node.js 20 or newer.

```bash
npm run verify
npm run example:mock
```

There are no runtime or development dependencies in P0. The verification commands run directly after cloning.

## Repository map

```text
adapters/mock/            Reference in-memory adapter
docs/                     Architecture, security, contract, and release rules
examples/                 Minimal runnable example
packages/adapter-sdk/     Adapter validation and event primitives
packages/conformance-kit/ Shared conformance assertions
schemas/                  Public JSON Schemas
scripts/                  Schema and public-boundary verification
tests/conformance/        Mock Adapter conformance tests
```

## Licensing and commercial services

The files covered by [LICENSE](LICENSE) are MIT licensed. MIT permits personal and commercial use without asking Cogiens for additional permission.

The MIT license does not grant rights to Cogiens trademarks and does not include Cogiens Cloud, enterprise control-plane modules, hosted runners, enterprise Trace, CGS-MEM governance, AquaPay, certification, SLA, or support services. See [COMMERCIAL.md](COMMERCIAL.md) and [TRADEMARKS.md](TRADEMARKS.md).

## Security

Do not open a public issue for a vulnerability that would expose credentials, customer code, or a working exploit. Follow [SECURITY.md](SECURITY.md).

## Contribution

Contributions require a Developer Certificate of Origin sign-off. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## P0 acceptance command

```bash
npm run verify
```

P0 passes only when schema checks, public-boundary checks, and conformance tests all pass.

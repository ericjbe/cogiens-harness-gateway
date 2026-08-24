# Agent Instructions

## Repository identity

- Treat this repository as the MIT-licensed **CHG public core only**.
- **Open CHG, not Cogiens.** The Cogiens Business System and proprietary commercial systems are closed source and must never be reconstructed, copied, summarized into executable logic, or introduced here.
- Read and obey [OPEN_SOURCE_BOUNDARY.md](OPEN_SOURCE_BOUNDARY.md) before changing code, docs, tests, examples, configuration, or generated artifacts.

## Commercial Boundary Gate

Before creating or modifying any public file, ask:

> If a competitor forks this repository tomorrow and legally uses this exact change commercially under MIT, are we explicitly willing to permit that?

If the answer is not an unqualified **yes**, stop and classify the work as private. Do not place it in this repository.

Treat commercial-boundary uncertainty as a blocker, not as permission to publish.

## Never add

- credentials, provider session files, customer data, production configuration, or private infrastructure topology;
- Cogiens Business System source code or private commercial modules;
- customer/tenant/account/transaction models used by proprietary systems;
- pricing, billing, settlement, revenue-attribution, acquisition, sales, conversion, or scoring logic;
- proprietary mission templates, prompts, digital-worker implementations, workflow packs, operating playbooks, or private runbooks;
- private memory, trace, evidence, policy, governance, or decision-system implementation;
- any code or content intended to remain proprietary or separately licensed.

A public API, schema, SDK, or protocol can be implemented here only when it is intentionally approved for unrestricted MIT publication. An interface does not make the system behind it open source.

## Engineering rules

- Keep vendor-specific behavior inside adapters.
- Preserve Job/Run/Session separation.
- Standard events must remain provider-neutral.
- Unsupported capability must fail explicitly; never simulate support silently.
- Approval, cancellation, isolation, and artifact evidence are acceptance gates.
- Run `npm run verify` before declaring work complete.
- A Commercial Boundary Gate failure is release-blocking and must be resolved before merge.

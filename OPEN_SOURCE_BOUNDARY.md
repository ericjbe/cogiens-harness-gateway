# Open Source Boundary

## Doctrine

**Open CHG, not Cogiens.**

Cogiens Harness Gateway (CHG) is an open-source infrastructure project. The Cogiens Business System and all proprietary commercial systems remain closed source.

The existence of a public CHG interface, adapter, schema, SDK, protocol, or integration point does **not** imply that any Cogiens commercial implementation behind or beside that interface is open source.

## What belongs in the CHG public core

The public repository may contain only generally reusable CHG infrastructure, including:

- provider-neutral Adapter Contracts and public schemas;
- adapter SDK and conformance primitives;
- local Gateway runtime and local developer/operator UI required to exercise CHG;
- harness adapters whose implementation is intended for unrestricted MIT use;
- public registries, compatibility metadata, examples, tests, RFCs, and developer documentation;
- open interoperability specifications, including portable job-format standards when separately approved for public release.

Every public-core component must be acceptable for a third party to fork, modify, redistribute, and use commercially under MIT.

## What must never enter this repository

The following categories are outside the CHG public core and must remain in private repositories or separately licensed systems:

- the Cogiens Business System or any part of its proprietary implementation;
- customer, tenant, account, transaction, revenue, pricing, settlement, or commercial entitlement systems;
- proprietary mission templates, commercial prompts, sales or acquisition logic, scoring logic, pricing logic, conversion logic, or revenue-attribution logic;
- proprietary digital-worker implementations, commercial workflow packs, internal orchestration policy, operational playbooks, or private runbooks;
- private memory, evidence, trace, policy, governance, or decision systems used by Cogiens commercial operations;
- internal control-plane logic, production topology, deployment secrets, private infrastructure automation, or customer-specific integrations;
- customer data, private telemetry, credentials, provider session material, or confidential business information;
- any source code that Cogiens would not knowingly permit a competitor to use commercially under MIT.

Public API documentation or SDKs for a closed-source service may be published separately when approved, but publication of an interface does not publish the service implementation.

## Commercial Boundary Gate

Every issue, pull request, release, generated artifact, and imported dependency must pass this question before entering the public repository:

> If a competitor forks this repository tomorrow and legally uses this change in a commercial product under MIT, are we explicitly willing to permit that?

If the answer is not an unqualified **yes**, the change is **BLOCKED** from the public repository.

Uncertainty is resolved toward privacy: keep the material out of the public repository and request a boundary review.

Commercial-boundary violations have the same release-blocking severity as credential leakage. They must be removed before merge or release.

## Separation rule

Public-core code and proprietary Cogiens code must live in separate repositories or separately licensed packages. Public CHG code may define stable integration boundaries for private systems, but it must not embed, mirror, reconstruct, or expose their proprietary implementation.

## License and brand

Files intentionally published in this repository are covered by the repository's MIT license unless a file states otherwise. Cogiens trademarks, logos, certification marks, hosted services, proprietary systems, and other separately licensed rights are not granted by the MIT license.

## Short form

**Open the interoperability road. Keep the commercial system private.**

# Public Core and Commercial Boundary

## Open CHG, not Cogiens

Cogiens Harness Gateway (CHG) is the open-source interoperability layer. The Cogiens Business System and all proprietary commercial systems remain closed source.

This repository is not a partial publication of the Cogiens commercial platform. It is a separate MIT-licensed infrastructure project with a deliberately narrow public scope.

See [OPEN_SOURCE_BOUNDARY.md](OPEN_SOURCE_BOUNDARY.md) for the normative repository boundary.

## What the MIT license allows

Files intentionally published as part of the CHG public core are licensed under MIT unless a file states otherwise. Anyone may use, copy, modify, distribute, sublicense, or sell MIT-covered code, including as part of a commercial product, provided the MIT notice is preserved.

Commercial use of MIT-covered CHG public-core code does **not** require a separate application to Cogiens.

That permission applies only to code actually published under MIT. It does not extend to private Cogiens source code, systems, data, services, workflows, commercial logic, or other rights that are not present in this repository.

## What is outside this repository's MIT scope

Unless Cogiens explicitly publishes a component under an open-source license, the following remain separate proprietary or commercial scope:

- hosted or managed services;
- enterprise control-plane capabilities;
- proprietary orchestration, workflow, policy, and decision systems;
- customer, tenant, account, transaction, pricing, billing, settlement, and revenue systems;
- private memory, evidence, trace, and data-governance systems;
- proprietary digital-worker implementations and commercial job/workflow packs;
- internal operating procedures, runbooks, scoring logic, acquisition logic, and commercial prompts;
- private deployment automation, upgrade channels, production infrastructure, SLA, and support;
- certification services and official certification marks;
- Cogiens trademarks, logos, partner badges, and other brand rights.

## Public interface does not mean public implementation

Cogiens may publish APIs, schemas, SDKs, protocol definitions, or integration documentation that allow CHG or third-party software to connect to a closed-source service.

Publishing an interface does **not** place the implementation behind that interface under MIT and does not create any implied source-code license.

## Repository boundary rule

Public-core and proprietary code must live in separate repositories or separately licensed packages.

A private commercial implementation must never be copied into this MIT repository for convenience, testing, demonstration, or temporary development. If a change cannot safely be given to any third party for unrestricted MIT commercial use, it does not belong here.

When classification is uncertain, the default is **private** until a boundary review explicitly approves publication.

## No implied vendor rights

An adapter's MIT license does not grant the right to resell, pool, transfer, or bypass the terms of the underlying model provider's accounts, subscriptions, APIs, trademarks, or hosted services. Each provider's current terms still apply.

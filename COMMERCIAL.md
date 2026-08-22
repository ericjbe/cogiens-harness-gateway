# Public Core and Commercial Boundary

## What the MIT license allows

The CHG public core is licensed under MIT. Anyone may use, copy, modify, distribute, sublicense, or sell MIT-covered code, including as part of a commercial product, provided the MIT notice is preserved.

Commercial use of the MIT-covered public core does **not** require a separate application to Cogiens.

## What is outside this repository's MIT scope

The following are separate Cogiens products, services, or rights unless Cogiens explicitly publishes a component under MIT:

- Cogiens Cloud managed control plane;
- hosted and cross-region Runner orchestration;
- enterprise tenant management, SSO, RBAC, and policy controls;
- enterprise Trace Control Center capabilities;
- CGS-MEM enterprise memory governance;
- AquaPay metering, settlement, and marketplace revenue sharing;
- certified adapter and digital-job marketplace services;
- enterprise private-deployment automation, upgrade channels, SLA, and support;
- Cogiens trademarks, logos, official certification marks, and partner badges.

Using these products or rights requires the applicable commercial agreement, service terms, certification agreement, or trademark permission.

## Boundary rule

Public-core code and commercial code must use separate repositories or independently licensed packages. A commercial module must never be copied into this MIT repository by accident. CI verifies a basic version of this boundary; maintainers remain responsible for legal and architectural review.

## No implied vendor rights

An adapter's MIT license does not grant the right to resell or pool the underlying model provider's accounts, subscriptions, APIs, trademarks, or hosted services. Each provider's current terms still apply.

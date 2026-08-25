## Problem

What user, compatibility, or security problem does this change solve?

## Change

What changed, and why is this the smallest safe change?

## Contract impact

- [ ] No public contract or schema change
- [ ] Backward-compatible change
- [ ] Breaking change with approved RFC and migration note

## Commercial Boundary Gate

Read [OPEN_SOURCE_BOUNDARY.md](../OPEN_SOURCE_BOUNDARY.md) before checking these boxes.

- [ ] **Open CHG, not Cogiens:** this PR contains only CHG public-core material intentionally suitable for unrestricted MIT commercial reuse.
- [ ] This PR contains no Cogiens Business System source, proprietary commercial workflow, private worker implementation, customer/tenant/transaction logic, pricing/billing/revenue logic, private runbook, production topology, or confidential business information.
- [ ] Any public API/schema/SDK in this PR exposes only an interface and does not embed or reconstruct a closed-source implementation.
- [ ] I would explicitly permit a competitor to fork and commercially use every newly published MIT-covered file in this PR.

If any box above cannot be checked, this PR is **BLOCKED** from the public repository pending boundary review.

## Evidence

- [ ] `npm run verify` passes
- [ ] New or updated conformance tests where relevant
- [ ] No secrets, customer data, provider sessions, or proprietary modules
- [ ] Third-party source and license disclosed
- [ ] Commits include DCO sign-off

## Security and side effects

Describe filesystem, network, credential, approval, or external-system effects.

## Boundary reviewer note

If the change touches commercial-adjacent interfaces, explain why the implementation is still safely publishable under MIT.

# Governance

## Principles

1. Public contracts are changed in public.
2. Compatibility claims require conformance evidence.
3. Security boundaries override convenience.
4. Experimental capability is never presented as stable capability.
5. Vendor-specific behavior stays in adapters, not in the CHG core contract.
6. **Open CHG, not Cogiens:** the CHG public core is open source; the Cogiens Business System and proprietary commercial implementations remain closed source.
7. A public interface never implies that the implementation behind it is open source.
8. Commercial-boundary violations are release blockers.

The normative public/private boundary is defined in [OPEN_SOURCE_BOUNDARY.md](OPEN_SOURCE_BOUNDARY.md).

## Roles

- **Contributor:** proposes code, documentation, tests, or design changes.
- **Maintainer:** reviews changes, protects compatibility, and operates releases.
- **Contract Steward:** approves changes to public schemas and Adapter Contract semantics.
- **Security Maintainer:** receives private reports and coordinates remediation.
- **Release Maintainer:** verifies provenance, licenses, tests, signed release artifacts, and public/commercial separation.
- **Boundary Reviewer:** confirms that a proposed change is intentionally suitable for unrestricted MIT publication and contains no proprietary Cogiens implementation.

The initial role assignment is controlled by the Cogiens project owner and must be published before the first external contribution is merged.

## Commercial Boundary Gate

Every pull request and release must pass a Commercial Boundary Gate before merge or publication.

The gate asks:

> If a competitor forks this repository tomorrow and legally uses this exact change in a commercial product under MIT, are we explicitly willing to permit that?

- **YES:** the change may continue through normal engineering review.
- **NO:** the change is `BLOCKED` from the public repository.
- **UNCERTAIN:** treat the material as private and request boundary review before publication.

The following are prohibited from the public repository: proprietary Cogiens business-system code, commercial workflows, private worker implementations, internal orchestration, customer/tenant/transaction systems, pricing/billing/revenue logic, private operational playbooks, confidential prompts, customer data, production secrets, private infrastructure topology, or any source that is not intentionally offered for MIT commercial reuse.

A Commercial Boundary Gate failure has the same merge-blocking priority as a credential leak. Removing or redacting the offending material is required before the change may proceed.

## Change classes

- Patch: clarification or compatible defect fix.
- Minor: backward-compatible capability or optional field.
- Major: incompatible wire, lifecycle, security, or semantic change.

Contract or schema changes require:

1. a public design issue or RFC;
2. compatibility impact analysis;
3. updated conformance tests;
4. approval by a Contract Steward and one Maintainer;
5. a migration note when any consumer action is required;
6. successful Commercial Boundary Gate review.

Emergency security changes may be prepared privately and disclosed after a patched release is available.

## Adapter status

Adapters use one of four statuses:

- `experimental`;
- `candidate`;
- `certified`;
- `deprecated`.

Only adapters that pass the published conformance suite against a pinned harness version may be called `candidate`. `Certified` is an official Cogiens commercial or community governance designation and is not granted by MIT alone.

## Separation of projects

CHG governance governs only the CHG public repository and its public contracts. It does not govern, publish, or license the Cogiens Business System or other proprietary Cogiens systems.

Private systems may consume CHG through documented interfaces without becoming part of the CHG public core.

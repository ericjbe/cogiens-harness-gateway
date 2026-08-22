# Governance

## Principles

1. Public contracts are changed in public.
2. Compatibility claims require conformance evidence.
3. Security boundaries override convenience.
4. Experimental capability is never presented as stable capability.
5. Vendor-specific behavior stays in adapters, not in the CHG core contract.
6. Public-core and commercial-module boundaries remain explicit.

## Roles

- **Contributor:** proposes code, documentation, tests, or design changes.
- **Maintainer:** reviews changes, protects compatibility, and operates releases.
- **Contract Steward:** approves changes to public schemas and Adapter Contract semantics.
- **Security Maintainer:** receives private reports and coordinates remediation.
- **Release Maintainer:** verifies provenance, licenses, tests, and signed release artifacts.

The initial role assignment is controlled by the Cogiens project owner and must be published before the first external contribution is merged.

## Change classes

- Patch: clarification or compatible defect fix.
- Minor: backward-compatible capability or optional field.
- Major: incompatible wire, lifecycle, security, or semantic change.

Contract or schema changes require:

1. a public design issue or RFC;
2. compatibility impact analysis;
3. updated conformance tests;
4. approval by a Contract Steward and one Maintainer;
5. a migration note when any consumer action is required.

Emergency security changes may be prepared privately and disclosed after a patched release is available.

## Adapter status

Adapters use one of four statuses:

- `experimental`;
- `candidate`;
- `certified`;
- `deprecated`.

Only adapters that pass the published conformance suite against a pinned harness version may be called `candidate`. `Certified` is an official Cogiens commercial or community governance designation and is not granted by MIT alone.

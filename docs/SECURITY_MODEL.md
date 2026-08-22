# Security Model

## Assets

- source code and customer files;
- provider credentials and login sessions;
- shell, network, and external-system permissions;
- approval decisions;
- artifacts and audit evidence;
- tenant identity, quota, and billing data.

## Trust boundaries

1. Client to CHG control plane.
2. Control plane to adapter process.
3. Adapter to vendor harness.
4. Harness to isolated workspace and tools.
5. Public core to separately licensed commercial services.

## P0 invariants

- A Run may write only within its validated workspace roots.
- Credentials are references in public objects, never plaintext fields.
- Approval timeout fails closed.
- `cancel requested` is not equal to `cancelled`.
- A Run is not cancelled until the adapter confirms it or the Runner terminates the owned process tree.
- A successful harness response is not automatically an accepted business result.
- Artifact hashes are computed before publication.
- Secret-like values must not appear in events or artifacts.
- Experimental adapters cannot receive production customer code by default.

## Threats covered by P0 tests

- workspace path escape;
- unapproved consequential action;
- event reordering or duplicate terminal events;
- cancellation while waiting for approval;
- secret reflection into event payloads;
- artifact hash mismatch;
- silent unsupported capability.

## Threats deferred

P0 does not claim container isolation, remote multi-tenant execution, cloud credential brokering, supply-chain signing, or production incident response. These require later construction and independent security review.

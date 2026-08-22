# Architecture

## Product boundary

Cogiens Harness Gateway is a control plane around heterogeneous agent harnesses. The core does not replace vendor reasoning loops, model access, or native sandbox implementations.

```text
Client / Cogiens business application
              |
         CHG Gateway API
              |
   Registry / Policy / Job Scheduler
              |
        Adapter Contract v0.1
       /          |          \
  Codex       Grok ACP     Qwen ACP       ...
       \          |          /
        Isolated Runner boundary
              |
       Artifact + Trace binding
```

## Core domain model

- **Job:** the business task and acceptance contract.
- **Run:** one attempt by one harness. Fallback always creates a new Run.
- **Session:** adapter-owned mapping to a native harness session.
- **Event:** provider-neutral lifecycle evidence.
- **Approval:** a fail-closed decision about a consequential action.
- **Artifact:** a hashed result, diff, test report, log, or structured output.

Job and Run must not be merged. One Job may launch several isolated Runs for comparison, review, or recovery.

## Public core

The public core owns contracts, schemas, adapter primitives, local orchestration, conformance tests, and reference adapters.

## Commercial control plane

Cogiens Cloud and enterprise modules may use the public contract but are not automatically part of this MIT repository. See `COMMERCIAL.md`.

## P0 architecture decision records

1. Dependency-free Node.js reference implementation.
2. JSON Schema Draft 2020-12 for public wire objects.
3. Async iterable event streams inside adapters.
4. Explicit capability negotiation.
5. Native payloads remain opaque adapter evidence, not public contract fields.
6. Unsupported capability fails explicitly.
7. Public source release and hosted public execution are separate gates.

# CHG Harness Adapter Contract v0.1

## Purpose

The contract lets CHG discover, start, observe, steer, approve, cancel, resume, and close heterogeneous harness sessions without pretending that all harnesses have identical capabilities.

## Required operations

```ts
interface HarnessAdapterV01 {
  describe(context): Promise<HarnessDescriptor>;
  health(context): Promise<HealthReport>;
  createSession(context, request): Promise<SessionHandle>;
  startRun(context, session, request): AsyncIterable<CHGEvent>;
  decideApproval(context, session, decision): Promise<CommandReceipt>;
  cancel(context, session, request): Promise<CancelResult>;
  collectArtifacts(context, session): AsyncIterable<ArtifactDescriptor>;
  close(context, session): Promise<CloseResult>;
}
```

`steer` and `resume` are optional capabilities. They must return `CAPABILITY_UNSUPPORTED` when unavailable.

## Capability negotiation

`describe()` returns a descriptor conforming to `schemas/harness-descriptor.v0.1.schema.json`. Capabilities are false unless detected. Experimental capabilities must be listed separately and may not satisfy a production policy requirement.

## Session request

A session request binds the adapter to:

- `job_id`, `run_id`, and `trace_id`;
- tenant, user, and project identity;
- one validated workspace root and explicit read/write roots;
- credential references, never plaintext credentials;
- network, approval, runtime, and output policies.

The adapter may narrow these permissions. It may not widen them.

## Event stream

Every event has:

- a stable event ID;
- Job, Run, Trace, and Adapter IDs;
- an opaque native session ID;
- a monotonically increasing sequence per Run;
- UTC time, type, severity, and provider-neutral payload.

Standard terminal event types are:

```text
run.succeeded
run.failed
run.cancelled
run.timed_out
```

One Run may have only one terminal event. `run.cancel_requested` is not terminal.

## Approval

Approval categories include shell command, network access, write outside workspace, privileged tool, external-system write, credential access, financial action, and business commitment.

CHG policy may be stricter than native harness policy. Timeout and missing decisions fail closed.

## Cancellation

`cancel()` returns whether cancellation was requested and whether it is confirmed. A control plane must not mark a Run `CANCELLED` until the adapter confirms it or the owned Runner process tree has been terminated and evidence recorded.

## Artifacts

Artifacts use SHA-256, an explicit media type, byte size, and trace binding. Embedded content is allowed only for small test and local artifacts. Production systems should use a controlled storage reference.

## Errors

Adapters throw or return errors with a stable code, retryability, origin, optional retry delay, and opaque native code. Unsupported capability is not an internal error.

Required baseline codes:

```text
AUTH_REQUIRED
AUTH_EXPIRED
RATE_LIMITED
QUOTA_EXHAUSTED
HARNESS_VERSION_UNSUPPORTED
ADAPTER_UNHEALTHY
PROTOCOL_MISMATCH
CAPABILITY_UNSUPPORTED
POLICY_DENIED
SANDBOX_DENIED
APPROVAL_DENIED
APPROVAL_TIMEOUT
WORKSPACE_INVALID
HARNESS_CRASHED
STREAM_INTERRUPTED
RUN_TIMED_OUT
CANCEL_UNCONFIRMED
ARTIFACT_COLLECTION_FAILED
INTERNAL_ERROR
```

## Versioning

- Patch: clarification or backward-compatible defect correction.
- Minor: optional field or compatible capability.
- Major: incompatible lifecycle, schema, security, or wire change.

Adapters declare the exact contract versions they implement. The Gateway refuses an incompatible major version.

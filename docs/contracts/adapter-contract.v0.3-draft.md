# Harness Adapter Contract v0.3 — Draft

Status: Architecture draft; not stable
Compatibility baseline: Adapter Contract v0.1 and CHG runtime v0.2

## Purpose

This draft defines the proposed lifecycle surface for registry-driven harness federation. It is published for review and implementation experiments. It must not be used as a production compatibility claim until method schemas, error semantics, conformance tests, and version negotiation are frozen.

## Proposed operations

| Operation | Intent | Evidence required before freeze |
|---|---|---|
| `discover()` | Identify executable, version, platform, provenance, and interface | Deterministic version/provenance result |
| `health()` | Verify executable, authentication, environment, and dependencies | Fail-closed diagnostic result |
| `authenticate()` | Report or initiate a provider-native authentication flow | No secret material in Job or event payloads |
| `capabilities()` | Return versioned supported, limited, and unsupported capabilities | Capability source and limitations |
| `dispatch()` | Start a normalized mission in an isolated workspace | Stable Run and native Session identities |
| `status()` | Read current native and normalized state | Monotonic lifecycle mapping |
| `stream()` | Stream normalized events without losing native evidence | Ordered event and terminal-state rules |
| `cancel()` | Request and confirm cancellation | Explicit confirmation or explicit failure |
| `resume()` | Resume a compatible native session | Versioned resume token semantics |
| `collect_artifacts()` | Return integrity-bound outputs | Media type, size, URI, and SHA-256 |
| `collect_events()` | Return durable normalized event history | Ordering and deduplication rules |
| `collect_usage()` | Return available tokens, cost, time, and resource use | Source and missing-data semantics |

The final contract may map these names onto existing v0.1 lifecycle primitives rather than requiring a breaking method rename.

## Proposed normalized run result

```json
{
  "contract_version": "chg.adapter.v0.3-draft",
  "run_id": "run_...",
  "harness_id": "H01",
  "adapter_id": "openai.codex.cli",
  "session_id": "ses_...",
  "native_session_id": null,
  "status": "SUCCEEDED",
  "started_at": "2026-08-23T00:00:00Z",
  "ended_at": "2026-08-23T00:01:00Z",
  "exit_code": 0,
  "artifacts": [],
  "events": [],
  "usage": {},
  "limitations": [],
  "trace_id": "trc_..."
}
```

## Mandatory defaults

```yaml
production_write: false
production_database: false
secret_export: false
payment_action: false
canonical_change: false
workspace_isolation: required
network_policy: restricted
mock_success: forbidden
unsupported_capability: explicit_failure
```

## Required semantics before stable freeze

The stable contract must define:

1. method request and response JSON Schemas;
2. contract and adapter version negotiation;
3. stable error codes, origin, retryability, and redaction;
4. event ordering, deduplication, and exactly-one-terminal-event rules;
5. dispatch idempotency and resume identity;
6. cancellation request, acknowledgement, confirmation, and timeout behavior;
7. authentication state without credential transport through CHG payloads;
8. capability source, confidence, limitations, and expiry;
9. artifact integrity, retention, and inaccessible-artifact behavior;
10. usage units, missing values, currency, and provider estimates;
11. v0.1/v0.2 compatibility mapping and deprecation policy;
12. conformance fixtures for success, failure, timeout, cancellation, and overflow.

## Status vocabulary

The registry support status and Run execution status are different dimensions.

Proposed integration support states:

- `DECLARED_UNVERIFIED`
- `DISCOVERED`
- `INSTALLED`
- `AUTHENTICATED`
- `CONFORMANCE_PARTIAL`
- `CONFORMANCE_VERIFIED`
- `PRODUCTION_CANDIDATE`
- `PRODUCTION_CERTIFIED`
- `BLOCKED`
- `DEPRECATED`

Proposed Combat Passport readiness states:

- `NATIVE_AUTONOMOUS`
- `LIMITED_AUTONOMOUS`
- `HUMAN_BRIDGED`
- `NOT_READY`

## Compatibility rule

Existing v0.1 schemas and v0.2 runtime behavior remain normative for released code until a later release explicitly freezes and implements v0.3. Publication of this file does not change the runtime contract version.

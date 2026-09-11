# One-way Runner result synchronization

This optional plugin publishes approved result metadata. It does not execute remote jobs,
deploy candidates, or expose a filesystem. Job, Run and Session remain separate. The legacy
Runner has no native run/trace identifiers; the adapter labels deterministic correlation IDs
as `runner-sync-derived-v1`. A workflow inherits its final attempt's gates explicitly.

## Rebuild and configuration

Run `npm run verify`. The gateway has no additional runtime dependencies. Set
`CHG_RESULT_SYNC_ROOT` to an operator-owned durable directory and
`CHG_RESULT_SYNC_IDENTITIES` to a local JSON file mapping identity names to
`{node_id, scopes: ["results:write"], public_jwk}`. Only P-256 public keys belong there.
Leave these unset to show `NOT_SYNCED`. Never commit production configuration.

On Windows, initialize a nonexportable service signing key using
`deploy/result-sync/service-identity.ps1 -Mode Initialize -KeyName <identity>`.
This exports public coordinates only, and never reads or uses SSH private keys.
Register that public JWK on the receiver. Run `node packages/result-sync/agent.mjs
<local-config>` under the same Windows account. Local configuration requires `directory`
(durable queue), `endpoint` (HTTPS ingest), `identity`, `key_name`, `node_id`,
`spool_root`, and an explicitly approved `job_ids` array. `--once` performs one delivery
cycle. A service supervisor should restart on failure. Do not store the configuration in Git.

The receiver's exact POST `/v1/result-sync/ingest` route requires service signatures,
independent of interactive login. Every other result route retains gateway authorization
and, behind the deployment proxy, the existing CP session gate. Keep TLS verification
enabled. Preserve the existing origin policy; the sender supplies the destination origin.
Service identities are node-scoped; public keys may be rotated by provisioning a new name
and removing the old registration after pending delivery completes.

## Evidence and safety

Only fixed fields and enumerated summaries cross the wire. Raw results, source files,
stdout/stderr, local paths, configuration, cookies, tokens and arbitrary artifacts are
excluded. Downloads are generated approved JSON summaries, not original raw logs. Their
size and SHA-256 cover downloaded bytes; `source_sha256` independently fingerprints the
original local result. Original evidence stays on the execution node.

Terminal results cannot be rewritten; retries create a new job linked by parent/root IDs.
Durable queue files remain pending until an authenticated HTTPS response acknowledges the
exact payload digest. Lost responses may retry safely. The single-process receiver serializes
updates and atomically replaces its durable state; do not share one state directory across
multiple receiver processes. Heartbeats older than three minutes are shown as stale.
Resource inventory is not inferred from job history; unavailable resource data says 尚未同步.

## Runner asset

`deploy/runner` preserves the verified automatic-recovery implementation, including strict
payload hashes, source binding, owned process cancellation, seven gates and immutable failed
attempt records. `Initialize-Runner.ps1` installs into a new directory, records script hashes
and snapshots the selected repository baseline without starting or replacing a service.
An existing verified source job and its manifest/evidence must be provisioned locally before
submitting `candidate-recovery-v1`; the Runner intentionally rejects a missing verified seed.
The legacy payload branch exists only to preserve historical behavior; recovery assembles a
fresh manifest from the exact verified source into a new isolated candidate.

## Release gates

Before and after committing, run the complete verification suite. Build an isolated container,
register a public service identity, synchronize approved real jobs, test idempotency, offline
retry, authorization and unchanged CP login, and check the rendered dashboard. Back up proxy
configuration and durable state on the host before cutover. Keep the original container
running for rollback. Validate proxy syntax, cut over only the gateway upstream, then repeat
health, login, evidence hashes and node-preservation checks. Restore the saved upstream on
any failed post-release gate. Application deployment never changes a Runner job from
READY_FOR_REVIEW to DEPLOYED; deployment evidence is tracked separately.

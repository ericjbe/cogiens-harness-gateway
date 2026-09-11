# Cogiens Harness Gateway

Cogiens Harness Gateway is a vendor-neutral gateway for stateful AI agent runtimes. It is not a model API router. The public core is MIT licensed; unsupported capabilities fail explicitly.

[简体中文](README.zh-CN.md)

The gateway preserves Job, Run and Session separation, provider-neutral events, cancellation, isolation and artifact evidence. Adapters contain provider-specific behavior. Commercial modules, customer data and production credentials do not belong in this repository.

## Run and verify

Use Node.js 20 or later and Git. Run `npm run verify` for schema, public-boundary, discoverability, federation and complete unit/integration validation. Start an isolated local gateway with `npm run gateway`; review configuration before enabling any execution adapter.

The model/Harness catalog declares ten free and six paid slots. A declared slot does not prove connectivity or authorization. Missing bindings fail explicitly; paid execution additionally requires server-side authorization, billing and budget gates. See [model catalog](docs/MODEL-HARNESS-CATALOG.md) and [adapter guide](docs/BUILD_AN_ADAPTER.md).

## Runner recovery and result visibility

[Runner scripts](deploy/runner) rebuild isolated candidates from a verified source, validate job-bound payload manifests, retain failed attempts and run seven acceptance gates. The gateway production worktree is preserved. A failed attempt remains REJECTED even when its tests passed; a successful candidate is READY_FOR_REVIEW until a separate deployment decision.

The optional [result synchronization plugin](docs/RESULT-SYNC.md) sends approved metadata from execution nodes over HTTPS with node-scoped service signatures. It keeps a durable retry queue, deduplicates deliveries and publishes generated evidence with SHA-256. It never synchronizes source, raw logs, local filesystem paths or credentials. The dashboard shows real recovery chains, gates, tests and heartbeats, and labels unavailable data 尚未同步.

Run the full suite before and after a release commit. Validate deployment in an isolated container with the existing authentication integration, record a backup and rollback plan, and pass the post-release checks before declaring deployment successful. Do not overwrite a live checkout with candidate files.

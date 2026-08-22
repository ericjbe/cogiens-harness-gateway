# Build a Harness Adapter

This guide is the shortest safe path from an official harness interface to a CHG adapter proposal. A minimal skeleton should take about 20 minutes; a production adapter requires substantially more evidence.

## 1. Use an official structured interface

Acceptable integration surfaces include an official SDK, app-server protocol, ACP endpoint, JSON-RPC interface, or documented headless structured mode. Do not scrape an interactive terminal, copy proprietary code, or submit provider credentials.

Record the upstream product, interface, version, source URL, license, authentication method, and operating-system constraints in the adapter proposal.

## 2. Verify the public baseline

```bash
git clone https://github.com/ericjbe/cogiens-harness-gateway.git
cd cogiens-harness-gateway
npm run verify
```

## 3. Create the package shape

```text
adapters/<adapter-name>/
├── package.json
└── src/
    └── index.mjs
```

Use the [Mock Adapter](../adapters/mock/src/index.mjs) as a lifecycle example, not as evidence that a real provider supports the same capabilities.

## 4. Declare capabilities truthfully

The descriptor must be validated by `validateHarnessDescriptor`. Example:

```js
const descriptor = {
  adapterId: "community.example.v0",
  harness: {
    name: "Example Harness",
    vendor: "Example Vendor",
    version: "pinned-upstream-version"
  },
  transports: ["json-rpc"],
  capabilities: {
    streaming: true,
    approvals: false,
    cancellation: true,
    resume: false,
    steer: false,
    artifacts: true,
    usage: false
  }
};
```

Use the current schema keys exactly. If a capability is absent or unverified, declare `false`; never silently emulate it.

## 5. Implement lifecycle operations

A P0 adapter implements:

```text
describe
health
createSession
startRun
decideApproval
cancel
collectArtifacts
close
```

`steer` and `resume` are optional and must match declared capabilities. Full semantics are in [Adapter Contract v0.1](ADAPTER_CONTRACT_v0.1.md).

## 6. Preserve identity and policy

- Keep Job, Run, native Session, Project, and Trace identities distinct.
- Emit identity fields on lifecycle events.
- Pass credential references; never persist plaintext secrets.
- Enforce workspace and tool boundaries before execution.
- Bind approval decisions to the exact request and run.
- Treat cancellation as complete only after native confirmation.

## 7. Emit a terminal result

Every accepted run must reach one terminal event: `run.completed`, `run.failed`, or `run.cancelled`. Timeouts, transport loss, unsupported capabilities, and rejected approvals must fail explicitly.

Artifacts require provenance and SHA-256 integrity metadata. A path alone is not sufficient evidence.

## 8. Add conformance evidence

Test at least:

- descriptor and capability truthfulness;
- identity propagation;
- event ordering and exactly one terminal event;
- approval allow and deny paths when supported;
- cancellation confirmation;
- artifact integrity and provenance;
- cleanup after success, error, and timeout;
- supported operating systems and pinned upstream version.

Run all public gates before opening a pull request:

```bash
npm run verify
```

## 9. Propose before claiming support

Open an [Adapter proposal](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=adapter.yml). A merged adapter must include interface and license sources, capability evidence, tests, maintainer ownership, known gaps, and upgrade/rollback notes.

Passing the shared conformance suite is necessary but not sufficient for “production candidate” status. See the [Adapter Catalog](ADAPTER_CATALOG.md).

# RFC 0001: Eight-Harness Federation Architecture

Status: Architecture freeze preview
Release label: `v0.3.0-architecture-freeze`
Runtime baseline: `v0.2.0-deployment-candidate`

Implementation update: `v0.3.0-alpha.1` implements the P2-A Registry Loader, capability model, split support/deployment states, evidence gates, and H01 Combat Passport. The cohort table below records the original architecture-freeze starting state; the runtime Registry is the current machine-readable status source.
Public project: Cogiens Harness Gateway (CHG)
Working architecture name: Cogiens Joint Harness Gate

## 1. Decision

CHG v0.3 will evolve the v0.2 local gateway into an extensible federation and joint-development control plane. It will preserve the verified v0.2 HTTP control plane, Job/Run lifecycle, bounded fan-out, timeout, cancellation, event, artifact, SHA-256, preflight, and fail-closed behavior.

This preview freezes architectural direction only. It does **not** claim that all eight harnesses are installed, integrated, conformant, or production-certified.

## 2. Why federation

Adding more command names to a static list would create a brittle collection of wrappers. The durable abstraction is a registry of harness identities, capabilities, interfaces, evidence, and support status. A new H09 or H10 must be addable without changing the gateway core.

The governing rule is:

```text
Native vendor harness
  -> official SDK or agent runtime
  -> auxiliary compatibility harness
  -> human-bridged execution
```

CHG must not screen-scrape an interactive interface when an official headless, structured, SDK, or protocol surface is available.

## 3. Architecture cohort

`FIRST_CLASS` is a roadmap priority, not a support claim. Actual support is expressed separately by `support_status` and evidence.

| ID | Integration target | Vendor | Candidate command | Integration tier | Initial support status |
|---|---|---|---|---|---|
| H01 | OpenAI Codex | OpenAI | `codex` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H02 | Claude Code | Anthropic | `claude` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H03 | Grok Build | xAI | `grok` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H04 | Kimi Code | Moonshot AI | `kimi` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H05 | DeepSeek Harness | DeepSeek | `dsh` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H06 | Qwen Code | Alibaba/Qwen | `qwen` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H07 | Antigravity CLI | Google | `agy` | FIRST_CLASS | DECLARED_UNVERIFIED |
| H08 | Mistral Vibe | Mistral AI | `vibe` | FIRST_CLASS | DECLARED_UNVERIFIED |

Hermes remains `AUXILIARY_COMPATIBILITY`. It can provide fallback, local-model, experimental-provider, and comparison paths, but it must not be presented as an independent native adapter for another vendor.

Command names are discovery candidates. A Combat Passport must pin the official interface, version, authentication flow, non-interactive invocation, output contract, platform support, and license before an adapter advances.

## 4. Layered architecture

```text
Operator / control plane
  -> Joint Development Command
  -> Cogiens Harness Gateway
  -> Harness Registry
  -> Capability Registry
  -> Mission Router
  -> Context Pack Builder
  -> Sandbox / Worktree Gate
  -> Artifact Intake
  -> Review / Red Team Workflow
  -> Telemetry / Evidence / Cost
  -> H01..H08 and auxiliary harnesses
```

The v0.2 fan-out engine remains a lower-level primitive. v0.3 adds evidence-bound collaboration and review stages rather than replacing the working runtime.

## 5. Combat Passport

Every harness integration must publish evidence for these gates:

| Gate | Requirement |
|---|---|
| HG-01 | Install and provenance |
| HG-02 | Version discovery and pinning |
| HG-03 | Authentication without secret export |
| HG-04 | Headless or structured invocation |
| HG-05 | Bounded workspace read |
| HG-06 | Bounded workspace write |
| HG-07 | Shell capability and restrictions |
| HG-08 | Test execution |
| HG-09 | Structured output |
| HG-10 | Session resume |
| HG-11 | Confirmed cancellation |
| HG-12 | Sandbox or worktree isolation |
| HG-13 | Artifact and usage telemetry |
| HG-14 | Trace and evidence binding |

Allowed readiness outcomes are:

- `NATIVE_AUTONOMOUS`
- `LIMITED_AUTONOMOUS`
- `HUMAN_BRIDGED`
- `NOT_READY`

Installation alone never implies autonomous readiness.

## 6. Mission dispatch

A normalized dispatch envelope will carry identity, workspace, policy, deliverables, and evidence requirements:

```yaml
campaign_id:
mission_id:
work_package_id:
role:
harness_id:
workspace:
branch_or_worktree:
context_pack:
allowed_tools:
network_policy:
timeout_seconds:
max_cost:
deliverables:
acceptance_contract:
trace_id:
```

Default-denied actions include production writes, production database access, secret export, payment actions, and canonical changes without an approved change request.

## 7. Isolation and artifact intake

Concurrent harness runs must not share one writable worktree. Each Run receives an independent Session, sandbox or worktree, event stream, artifact set, integrity hash, and terminal state.

A completion statement is not evidence. Artifact intake must normalize at least:

- Run, harness, session, project, and trace identities;
- files changed and patch or Git diff;
- tests and logs;
- produced artifacts and SHA-256 digests;
- limitations, open questions, and usage or cost data.

## 8. Joint workflow

The proposed workflow is:

```text
Lead assignment
  -> Submission
  -> Collaborator review
  -> Red team
  -> Rework
  -> Joint integration
  -> Acceptance
  -> Operator freeze
```

No stage may convert a failed, cancelled, timed-out, or unsupported run into success.

## 9. Compatibility and migration

The following v0.2 surfaces remain compatibility anchors:

- local HTTP API;
- Job and Run identities;
- bounded fan-out;
- timeout and cancellation;
- events and SHA-256 artifacts;
- `config/harnesses.local.json` local detection;
- explicit failure for missing executables, authentication, or capabilities.

Static adapter configuration will migrate behind the v0.3 registry incrementally. There will be no big-bang rewrite.

## 10. Delivery sequence

1. Audit v0.2 source and tests.
2. Run the eight-harness P0 census.
3. Iterate and freeze the Adapter Contract.
4. Implement the registry and capability model.
5. Produce Combat Passports.
6. Add worktree isolation and artifact intake.
7. Add one native adapter at a time with evidence.
8. Add joint review and red-team workflow.
9. Add optional Cogiens control-plane projections last.

## 11. Public and commercial boundary

The registry, contract drafts, conformance rules, public adapters, and local federation core belong to the MIT public core. Hosted orchestration, enterprise identity, managed runners, certification, billing, SLA, and Cogiens-specific business modules remain separate commercial scope.

Vendor names identify integration targets only. CHG is not affiliated with or endorsed by those vendors. Users remain responsible for provider accounts, licenses, terms, and charges.

## 12. Freeze statement

This RFC freezes the **direction** of v0.3: Registry + Capability + Combat Passport + Isolation + Artifact Intake + Joint Workflow + Telemetry. It does not freeze method-level API schemas and does not certify any of H01-H08. Those require public review, implementation, conformance evidence, and platform-specific testing.

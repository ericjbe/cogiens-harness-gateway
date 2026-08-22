# Digital Job Packs

Digital Job Packs are the proposed contribution unit for reusable, bounded digital roles that execute through compatible harness adapters.

## Current truth

P0 does **not** define a stable Digital Job Pack contract. The current `job.v0.1` schema describes one unit of work; it is not yet a portable role package. Job Pack design is an open RFC track and compatibility must not be claimed until the contract is accepted and tested.

## Proposed responsibilities

A future Job Pack should make these properties reviewable:

- name, version, purpose, and explicit non-goals;
- typed inputs, outputs, and artifact expectations;
- required and optional harness capabilities;
- tool, network, filesystem, and credential permissions;
- human approval points and risk classification;
- evidence, evaluation fixtures, and acceptance tests;
- supported Adapter Contract versions;
- source, dependency, content, and trademark licenses;
- maintainer, security contact, and update policy.

## Non-negotiable rules

1. A Job Pack cannot grant itself permissions that the operator did not authorize.
2. Unsupported harness capabilities must fail explicitly.
3. Credentials are referenced, never embedded.
4. Consequential actions require auditable policy and approval decisions.
5. Outputs and evidence bind to Job, Run, Session, Project, and Trace identities.
6. Job Pack code and content must have compatible public licenses.

## Join the design

Open a [Digital Job Pack proposal](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=digital-job-pack.yml) describing one real role and its evidence. Concrete roles are preferred to abstract schema debates because they expose missing permissions, inputs, lifecycle events, and evaluation rules.

The first contract version should be accepted only after at least three materially different role proposals can be expressed without provider-specific assumptions.

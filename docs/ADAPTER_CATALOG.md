# Adapter Catalog

This catalog separates verified support from integration intent. A vendor name in a roadmap is not a compatibility claim or endorsement.

## Acceptance levels

| Level | Meaning |
|---|---|
| Reference | Maintained in this repository and passing the public conformance suite |
| Experimental | Runnable integration with limited support and explicit gaps |
| Community | Externally maintained adapter with published source and evidence |
| Production candidate | Pinned interface, security review, isolation, lifecycle evidence, and upgrade tests |
| Planned | Research or design intent only; no support claim |

## Current catalog

| Harness / adapter | Level | Interface | Evidence | Maintainer |
|---|---|---|---|---|
| In-memory Mock Harness | Reference | Local JavaScript interface | 10 conformance tests | Cogiens contributors |
| OpenAI Codex app-server | Planned | Official interface must be pinned | Not yet published | Open |
| Grok-compatible harness | Planned | Official structured/headless interface required | Not yet published | Open |
| Qwen-compatible harness | Planned | ACP or official structured interface required | Not yet published | Open |
| DeepSeek-compatible harness | Planned | Official structured interface required | Not yet published | Open |

## Add an adapter

1. Read [Build an Adapter](BUILD_AN_ADAPTER.md) and the [Adapter Contract](ADAPTER_CONTRACT_v0.1.md).
2. Open an [Adapter proposal](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=adapter.yml) with an official interface source.
3. Publish the capability map, authentication constraints, upstream version, failure semantics, and license evidence.
4. Implement lifecycle behavior without shell-scraping an interactive UI.
5. Submit conformance results and platform evidence with the pull request.

Adapters may be maintained in this repository or independently. Independent adapters should state the contract version, source license, supported capabilities, verification command, and maintainer contact.

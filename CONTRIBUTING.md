# Contributing

CHG is developed in public for global users. Contributions are welcome when they preserve the security, compatibility, provenance, and public/commercial boundaries of the project.

## Choose a contribution route

| I want to… | Start here |
|---|---|
| Make a first contribution | Choose a [`good first issue`](https://github.com/ericjbe/cogiens-harness-gateway/contribute) and keep the first PR small |
| Connect a harness | Read [Build an Adapter](docs/BUILD_AN_ADAPTER.md), then open an [Adapter proposal](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=adapter.yml) |
| Define a reusable digital role | Read [Digital Job Packs](docs/DIGITAL_JOB_PACKS.md), then open a [Job Pack proposal](https://github.com/ericjbe/cogiens-harness-gateway/issues/new?template=digital-job-pack.yml) |
| Improve interoperability evidence | Add conformance cases, platform results, or an official-interface evidence table |
| Improve access and understanding | Fix docs, examples, accessibility, diagrams, or translations |
| Report a vulnerability | Follow [SECURITY.md](SECURITY.md); do not open a public exploit report |

Good first pull requests change one reviewable thing, include the relevant test or link check, and avoid changing lifecycle semantics. If you are unsure, open an issue before writing code.

## Before contributing

1. Search existing issues and proposals.
2. Open a design issue before changing lifecycle semantics, schemas, security policy, or public API.
3. Keep vendor-specific behavior inside the relevant adapter.
4. Add or update conformance tests.
5. Do not submit credentials, customer data, copied proprietary code, model-provider session files, or code with an incompatible license.

## Developer Certificate of Origin

Every commit must include a DCO sign-off:

```text
Signed-off-by: Your Name <your-email@example.com>
```

Create it with:

```bash
git commit -s
```

By signing off, you certify that you have the right to submit the contribution under the repository's license. See [DCO.md](DCO.md).

## Pull requests

- Keep each pull request focused.
- Explain the user problem and compatibility impact.
- List tests and evidence.
- Identify third-party source or generated content.
- Run `npm run verify` before submission.
- Do not weaken approval, sandbox, credential, or isolation behavior merely to make a test pass.

Adapter pull requests must also state the pinned upstream interface, verified capabilities, known gaps, supported platforms, license source, and maintainer. Job Pack work remains an RFC track until a stable contract is approved.

## License boundary

Contributions to this public repository are submitted under MIT. Do not submit Cogiens commercial modules or code that requires a commercial-only license.

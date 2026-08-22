# Contributing

CHG is developed in public for global users. Contributions are welcome when they preserve the security, compatibility, provenance, and public/commercial boundaries of the project.

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

## License boundary

Contributions to this public repository are submitted under MIT. Do not submit Cogiens commercial modules or code that requires a commercial-only license.

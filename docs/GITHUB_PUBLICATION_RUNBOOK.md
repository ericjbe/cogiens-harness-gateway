# GitHub Publication Runbook

## Required freeze values

Before the first external write, freeze:

- GitHub owner or organization;
- repository name;
- default branch (`main` recommended);
- public visibility;
- initial maintainers and security maintainers;
- verified trademark owner name;
- whether DCO alone or a separate CLA is required.

Recommended repository name: `cogiens-harness-gateway`.

## Publication sequence

1. Create the public repository without generating a conflicting README or license.
2. Initialize this package as the repository root.
3. Run `npm run verify`; P0 has no package-install step or external dependency.
4. Inspect every staged path and run a secret scan.
5. Commit with DCO sign-off.
6. Push a feature branch and open a draft pull request when repository policy requires review.
7. Require CI on Linux and Windows.
8. Merge to `main` only after all P0 gates pass.
9. Enable private vulnerability reporting and branch protection.
10. Publish the P0 status prominently: `NOT PRODUCTION READY`.

## Required repository settings

- public visibility;
- branch protection on `main`;
- pull request review before merge;
- required `public-core-ci` checks;
- dismiss stale reviews after changes;
- block force pushes and branch deletion;
- enable secret scanning and push protection when available;
- enable Dependabot alerts;
- enable private vulnerability reporting;
- disable wiki and packages until an owner is assigned, unless explicitly needed.

## No-go conditions

Do not publish if the owner is ambiguous, the repository contains credentials or customer data, the license boundary is unclear, tests fail, or a commercial-only module is present.

# Security Policy

## Supported versions

P0 is a construction baseline and is not approved for production or for hosting untrusted public workloads.

## Reporting a vulnerability

Use the repository's private GitHub Security Advisory reporting function. Do not publish credentials, customer data, a working exploit, or an unpatched vulnerability in a public issue.

Include:

- affected commit or version;
- adapter and underlying harness version;
- operating system and execution mode;
- reproduction steps with secrets removed;
- observed and expected behavior;
- potential impact;
- suggested mitigation, if known.

The project will publish a verified security contact and response targets before the first public release. Until then, the public repository must remain marked `P0 / NOT PRODUCTION READY`.

## Security release rule

No adapter may become `candidate` if cancellation, approval fail-closed behavior, workspace isolation, secret redaction, or process cleanup is unverified.

# P0 Acceptance Gates

| Gate | Requirement | Evidence |
|---|---|---|
| P0-G1 | Public GitHub-ready repository structure exists | Repository tree |
| P0-G2 | Standard MIT license is present | `LICENSE` |
| P0-G3 | Commercial and trademark boundaries are explicit | `COMMERCIAL.md`, `TRADEMARKS.md` |
| P0-G4 | Contribution and governance process exists | `CONTRIBUTING.md`, `DCO.md`, `GOVERNANCE.md` |
| P0-G5 | Private vulnerability path is defined | `SECURITY.md` |
| P0-G6 | Contract objects have parseable schemas | `npm run verify:schemas` |
| P0-G7 | Mock Adapter completes lifecycle | Conformance test |
| P0-G8 | Approval fails closed | Conformance test |
| P0-G9 | Cancellation becomes a confirmed terminal event | Conformance test |
| P0-G10 | Workspace escape is rejected | Conformance test |
| P0-G11 | Artifacts have verified SHA-256 | Conformance test |
| P0-G12 | Secrets are not reflected into events | Conformance test |
| P0-G13 | Unsupported capability fails explicitly | Conformance test |
| P0-G14 | Public boundary scan passes | `npm run verify:boundary` |
| P0-G15 | Linux and Windows CI are configured | `.github/workflows/ci.yml` |

P0 is accepted only when `npm run verify` exits with code 0 and there are no unresolved critical security or licensing findings.

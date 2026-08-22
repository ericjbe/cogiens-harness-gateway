# Public and Commercial Boundary

| Capability | Public MIT core | Separate Cogiens commercial scope |
|---|---:|---:|
| Adapter Contract and schemas | Yes | No |
| Adapter SDK and conformance kit | Yes | No |
| Local Community Gateway | Yes | No |
| Reference adapters | Yes, when explicitly published | No |
| Cogiens Cloud control plane | No | Yes |
| Enterprise tenancy, SSO, RBAC | No | Yes |
| Hosted and cross-region runners | No | Yes |
| Enterprise Trace and compliance | No | Yes |
| CGS-MEM enterprise governance | No | Yes |
| AquaPay billing and settlement | No | Yes |
| Certified marketplace and badges | Contract may be public | Service and marks are commercial |
| Enterprise support and SLA | No | Yes |

## Packaging rule

Commercial-only source must live outside the public MIT repository. A public package may call a documented commercial API, but it must not embed commercial source, production credentials, customer configuration, or proprietary datasets.

## Release review

Every public release must verify:

1. license and notice files;
2. third-party provenance and SBOM;
3. secret scan;
4. absence of commercial-only paths;
5. conformance and security tests;
6. signed tag and reproducible release notes.

# Shuishu acceptance identity authorization plan

This plan is ready for one controlled authorization action after the production CP owner confirms support. It never uses the Founder account and contains no credential material.

The production capability probe found one active `SUPER_ADMIN` and no existing `READONLY`, auditor, service identity, or scoped acceptance role. `ensure_admin` returns an existing account without synchronizing its password from startup configuration. Therefore the current result is `ACCOUNT_CAPABILITY_GAP`; no production account was created and no second `SUPER_ADMIN` is proposed.

The CP adapter should map a dedicated, expiring `AUDIT_READONLY` grant to exactly these operations: authenticate, read the Shuishu dashboard and result evidence, logout, and verify session revocation. It must deny customer administration, pricing, payments, deletion, deployment, account administration, and all write routes. The grant should be server-side, independently revocable, and rotatable. Its secret belongs only in a protected server Secret (mode 0600 or the platform equivalent), injected at runtime; it must never enter Git, logs, chat, reports, browser URLs, or job payloads.

Enrollment is ready only when the CP owner performs one step: create or authorize that least-privilege identity through the existing CP administration path and provide its secret directly to the protected server Secret mechanism. The adapter then runs the login, dashboard-read, logout, pre-logout replay rejection, restart persistence, wrong-password 401, wrong-CSRF 403, anonymous rejection, Aquahub/CP entry regression checks. The identity can be revoked or rotated without changing the Founder account.

Until CP exposes this capability and the server-side logout revocation check is deployed through the normal release gate, `ACCOUNT_ENROLLMENT_READY=false` and deployment remains blocked.

# Agent Instructions

- Treat this repository as the MIT public core.
- Never add credentials, provider session files, customer data, production configuration, or Cogiens commercial modules.
- Keep vendor-specific behavior inside adapters.
- Preserve Job/Run/Session separation.
- Standard events must remain provider-neutral.
- Unsupported capability must fail explicitly; never simulate support silently.
- Approval, cancellation, isolation, and artifact evidence are acceptance gates.
- Use `npm run verify` before declaring work complete.

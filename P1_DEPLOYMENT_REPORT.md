# P1 Deployment Candidate Report

Version: `0.2.0`
Scope: local-first deployment candidate
License: MIT public core

## Delivered

- dependency-free Node.js HTTP gateway;
- bounded parallel fan-out from one Job to multiple Runs;
- candidate adapters for official Codex CLI non-interactive mode, Hermes one-shot mode, and the published DeepSeek Harness Python SDK;
- executable/auth/environment preflight with fail-closed enablement;
- timeout, output cap, process-tree cancellation, terminal events, redaction, and SHA-256 result artifacts;
- Windows PowerShell and WSL2 install/start/stop/test scripts;
- local CLI for health, adapter inventory, fan-out submission, polling, and job retrieval;
- runtime and conformance tests.

The public HTTP views use `chg.gateway.job.v0.2` and `chg.gateway.run.v0.2`. Adapter-bound requests, events, and artifacts continue to use the published v0.1 Adapter Contract schemas; the Gateway views intentionally add orchestration fields and do not falsely claim to satisfy the narrower v0.1 Job/Run JSON Schemas.

## Honest boundary

These are candidate one-shot adapters, not production-certified adapters. Approval bridging, durable distributed scheduling, multi-tenant authentication, remote runners, usage accounting, and production persistence remain open work. Grok and Qwen are not presented as independent harness adapters.

## Acceptance command

```text
npm run verify
```

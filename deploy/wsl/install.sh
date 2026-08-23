#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$task_root"

command -v node >/dev/null || { echo "Node.js 20 or newer is required." >&2; exit 1; }
node_major="$(node -p 'process.versions.node.split(".")[0]')"
test "$node_major" -ge 20 || { echo "Node.js 20 or newer is required." >&2; exit 1; }

mkdir -p var/logs
test -f config/harnesses.local.json || cp config/harnesses.example.json config/harnesses.local.json
node scripts/detect-adapters.mjs
npm run verify

echo "CHG checks passed. No credentials were written."
echo "Next: bash deploy/wsl/start.sh"

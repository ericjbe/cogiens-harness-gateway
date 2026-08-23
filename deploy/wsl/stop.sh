#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pid_file="$task_root/var/gateway.pid"
test -f "$pid_file" || { echo "CHG is not running (PID file absent)."; exit 0; }
gateway_pid="$(cat "$pid_file")"
[[ "$gateway_pid" =~ ^[0-9]+$ ]] || { echo "Invalid gateway PID file." >&2; exit 1; }
if kill -0 "$gateway_pid" 2>/dev/null; then
  kill "$gateway_pid"
  wait "$gateway_pid" 2>/dev/null || true
fi
rm -f "$pid_file"
echo "CHG stopped."

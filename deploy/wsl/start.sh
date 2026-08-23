#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$task_root"
mkdir -p var/logs
pid_file="var/gateway.pid"
if test -f "$pid_file" && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
  echo "CHG is already running with PID $(cat "$pid_file")." >&2
  exit 1
fi
nohup node apps/gateway/src/server.mjs >var/logs/gateway.out.log 2>var/logs/gateway.err.log &
gateway_pid="$!"
echo "$gateway_pid" >"$pid_file"
sleep 1
kill -0 "$gateway_pid" 2>/dev/null || { echo "CHG failed to start; read var/logs/gateway.err.log" >&2; exit 1; }
echo "CHG started: PID $gateway_pid, http://127.0.0.1:8787"

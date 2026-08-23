#!/usr/bin/env bash
set -euo pipefail

headers=()
if test -n "${CHG_API_TOKEN:-}"; then headers=(-H "Authorization: Bearer $CHG_API_TOKEN"); fi
curl --fail --silent --show-error "${headers[@]}" http://127.0.0.1:8787/health
echo

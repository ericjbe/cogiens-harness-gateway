#!/usr/bin/env bash
set -euo pipefail
umask 077

MIRROR_ROOT="${MIRROR_ROOT:-/opt/cogiens-git-mirror}"
HARNESS_REPO="${HARNESS_REPO:-git@github.com:ericjbe/cogiens-harness-gateway.git}"
WATER_REPO="${WATER_REPO:-git@github.com:ericjbe/Water-science.git}"

command -v git >/dev/null 2>&1 || { echo "git not found" >&2; exit 1; }

mkdir -p "$MIRROR_ROOT"
chmod 700 "$MIRROR_ROOT"

ensure_mirror() {
  local url="$1"
  local name="$2"
  local path="$MIRROR_ROOT/$name.git"

  if [[ -d "$path" ]]; then
    echo "[UPDATE] $name"
    git --git-dir="$path" remote update --prune
  else
    echo "[CLONE] $name"
    git clone --mirror "$url" "$path"
  fi
}

ensure_mirror "$HARNESS_REPO" "cogiens-harness-gateway"
ensure_mirror "$WATER_REPO" "water-intelligence"

cat > "$MIRROR_ROOT/README_MIRROR_POLICY.txt" <<'EOF'
Cogiens Git Mirror Policy

1. GitHub main is canonical during normal operation.
2. This server is mirror/backup/deployment support, not a second writable development main.
3. Credentials must be managed outside repository files.
4. Restore tests must periodically clone from these bare mirrors into a temporary directory.
5. Promotion of this mirror to a temporary primary requires an explicit incident decision.
EOF
chmod 600 "$MIRROR_ROOT/README_MIRROR_POLICY.txt"

echo "Mirrors ready under: $MIRROR_ROOT"

echo "Suggested scheduled command (configure with your system scheduler and secure SSH credentials):"
echo "  MIRROR_ROOT=$MIRROR_ROOT $0"

#!/usr/bin/env bash
set -euo pipefail

# This repository is public and stands on its own. Fail the build if a term from a
# private or employer context ever ends up in it.
PATTERNS=(
  'yumbrands'
  'yumconnect'
  'yumdev'
  'yum-cli'
  'YMDM-'
)

status=0
for pattern in "${PATTERNS[@]}"; do
  matches=$(grep -rIn -i -e "$pattern" . \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=.git \
    --exclude="$(basename "$0")" || true)
  if [ -n "$matches" ]; then
    echo "Disallowed reference for pattern '$pattern':"
    echo "$matches"
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  exit 1
fi

echo "No disallowed references found."

#!/bin/bash
set -euo pipefail

# Installs the repo-local Git hooks by configuring core.hooksPath
ROOT_DIR=$(cd "$(dirname "$0")" && pwd)
GIT_DIR="$ROOT_DIR/.githooks"

if [ ! -d "$GIT_DIR" ]; then
  echo "No .githooks directory found in $ROOT_DIR"
  exit 1
fi

git config core.hooksPath "$GIT_DIR"
echo "Installed git hooks from $GIT_DIR"

#!/bin/bash
# SessionStart hook: install project dependencies in Claude Code on the web sessions.
# Idempotent and non-interactive. Detects manifests so it keeps working as the project grows.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Node.js
if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ]; then
    corepack enable >/dev/null 2>&1 || true
    pnpm install
  elif [ -f yarn.lock ]; then
    corepack enable >/dev/null 2>&1 || true
    yarn install
  else
    npm install
  fi
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export PATH="$CLAUDE_PROJECT_DIR/node_modules/.bin:$PATH"' >> "$CLAUDE_ENV_FILE"
  fi
fi

# Python
if [ -f requirements.txt ]; then
  pip install -r requirements.txt
elif [ -f pyproject.toml ]; then
  pip install -e .
fi

# PHP
if [ -f composer.json ] && command -v composer >/dev/null 2>&1; then
  composer install --no-interaction
fi

exit 0

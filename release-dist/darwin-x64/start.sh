#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -x "${SCRIPT_DIR}/bin/opencode" ]]; then
  export OPENCODE_WEB_ROOT="${SCRIPT_DIR}/web"
  export CC_SWITCH_SERVER_PATH="${SCRIPT_DIR}/bin/cc-switch-server"
  exec "${SCRIPT_DIR}/bin/opencode" serve \
    --mode "${OPENCODE_MODE:-prod}" \
    --hostname "${OPENCODE_HOST:-0.0.0.0}" \
    --port "${OPENCODE_PORT:-4096}"
else
  echo "二进制文件不存在，使用源码模式..."
  if ! command -v bun >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install | bash
    export PATH="${HOME}/.bun/bin:${PATH}"
  fi
  cd "${SCRIPT_DIR}/backend"
  bun install
  export OPENCODE_WEB_ROOT="${SCRIPT_DIR}/web"
  export CC_SWITCH_SERVER_PATH="${SCRIPT_DIR}/bin/cc-switch-server"
  exec bun run --conditions=browser src/index.ts serve \
    --mode "${OPENCODE_MODE:-prod}" \
    --hostname "${OPENCODE_HOST:-0.0.0.0}" \
    --port "${OPENCODE_PORT:-4096}"
fi

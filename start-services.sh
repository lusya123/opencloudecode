#!/usr/bin/env bash
set -euo pipefail

OPENCODE_HOST=${OPENCODE_HOST:-0.0.0.0}
OPENCODE_PORT=${OPENCODE_PORT:-4096}
CC_SWITCH_PORT=${CC_SWITCH_PORT:-8766}
MODE=${MODE:-prod}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT_DIR}/logs"
WEB_DIST_DEFAULT="${ROOT_DIR}/opencode-pro/packages/app/dist"
CC_SWITCH_SERVER_DEFAULT="${ROOT_DIR}/cc-switch-main/src-tauri/target/release/cc-switch-server"

mkdir -p "${LOG_DIR}"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ROOT_DIR}/.env"
  set +a
fi

if [[ -f "${LOG_DIR}/opencode.pid" ]]; then
  echo "检测到已有 PID 文件: ${LOG_DIR}/opencode.pid (如需重启请先 ./stop-services.sh)"
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "未找到 bun，请先运行 ./deploy.sh 安装依赖并构建。"
  exit 1
fi

OPENCODE_WEB_ROOT="${OPENCODE_WEB_ROOT:-${WEB_DIST_DEFAULT}}"
CC_SWITCH_SERVER_PATH="${CC_SWITCH_SERVER_PATH:-${CC_SWITCH_SERVER_DEFAULT}}"

(
  cd "${ROOT_DIR}/opencode-dev/packages/opencode"
  nohup env \
    OPENCODE_WEB_ROOT="${OPENCODE_WEB_ROOT}" \
    CC_SWITCH_SERVER_PATH="${CC_SWITCH_SERVER_PATH}" \
    CC_SWITCH_PORT="${CC_SWITCH_PORT}" \
    bun run --conditions=browser src/index.ts serve \
      --mode "${MODE}" \
      --hostname "${OPENCODE_HOST}" \
      --port "${OPENCODE_PORT}" \
    > "${LOG_DIR}/opencode.log" 2>&1 &
  echo $! > "${LOG_DIR}/opencode.pid"
)

PID="$(cat "${LOG_DIR}/opencode.pid")"

for _ in $(seq 1 30); do
  if ! kill -0 "${PID}" 2>/dev/null; then
    echo "启动失败：OpenCode 进程已退出 (PID: ${PID})"
    echo "---- 最近日志 ----"
    tail -n 120 "${LOG_DIR}/opencode.log" || true
    rm -f "${LOG_DIR}/opencode.pid"
    exit 1
  fi
  if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"${OPENCODE_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
  else
    break
  fi
  sleep 0.5
done

if command -v lsof >/dev/null 2>&1; then
  if ! lsof -nP -iTCP:"${OPENCODE_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "启动失败：超过等待时间仍未监听端口 ${OPENCODE_PORT} (PID: ${PID})"
    echo "---- 最近日志 ----"
    tail -n 120 "${LOG_DIR}/opencode.log" || true
    kill "${PID}" 2>/dev/null || true
    rm -f "${LOG_DIR}/opencode.pid"
    exit 1
  fi
fi

echo "已启动: http://localhost:${OPENCODE_PORT} (API: /api)"

#!/usr/bin/env bash
set -euo pipefail

# 用法：
#   ./deploy.sh              # 默认 prod
#   ./deploy.sh prod         # 构建前端并由后端统一提供 Web + API
#   ./deploy.sh dev          # 同 prod（预留：将来可扩展为真正 dev 模式）
MODE=${1:-prod}

OPENCODE_HOST=${OPENCODE_HOST:-0.0.0.0}
OPENCODE_PORT=${OPENCODE_PORT:-4096}
CC_SWITCH_PORT=${CC_SWITCH_PORT:-8766}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT_DIR}/logs"
WEB_DIST_DEFAULT="${ROOT_DIR}/opencode-pro/packages/app/dist"
CC_SWITCH_SERVER_DEFAULT="${ROOT_DIR}/cc-switch-main/src-tauri/target/release/cc-switch-server"

echo "=== OpenCode 一键部署脚本 (模式: ${MODE}) ==="

mkdir -p "${LOG_DIR}"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ROOT_DIR}/.env"
  set +a
fi

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then return 0; fi
  echo "安装 Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${HOME}/.bun"
  export PATH="${BUN_INSTALL}/bin:${PATH}"
}

ensure_rust() {
  if command -v cargo >/dev/null 2>&1; then return 0; fi
  echo "安装 Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  export PATH="${HOME}/.cargo/bin:${PATH}"
}

ensure_bun
ensure_rust

export PATH="${HOME}/.bun/bin:${HOME}/.cargo/bin:${PATH}"

echo "安装依赖..."
(
  cd "${ROOT_DIR}/opencode-dev"
  bun install
)
(
  cd "${ROOT_DIR}/opencode-pro"
  bun install
)

echo "构建前端..."
if [[ ! -f "${WEB_DIST_DEFAULT}/index.html" ]]; then
  (cd "${ROOT_DIR}/opencode-pro" && bun run build)
fi

echo "构建 CC Switch Server..."
if [[ ! -x "${CC_SWITCH_SERVER_DEFAULT}" ]]; then
  (cd "${ROOT_DIR}/cc-switch-main/src-tauri" && cargo build --release --bin cc-switch-server)
fi

echo "启动服务..."
if [[ -f "${LOG_DIR}/opencode.pid" ]]; then
  echo "检测到已有 PID 文件: ${LOG_DIR}/opencode.pid (如需重启请先 ./stop-services.sh)"
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

echo ""
echo "=== 部署完成 ==="
echo "Web:  http://localhost:${OPENCODE_PORT}"
echo "API:  http://localhost:${OPENCODE_PORT}/api"
echo "CC-Switch(内部): http://127.0.0.1:${CC_SWITCH_PORT}"
echo ""
echo "日志: ${LOG_DIR}/opencode.log"
echo "停止: ./stop-services.sh"

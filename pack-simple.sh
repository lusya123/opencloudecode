#!/usr/bin/env bash
set -euo pipefail

# OpenCode 简化版打包脚本
# 打包源码 + 前端 + cc-switch-server，用户需要安装 Bun 来运行

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${ROOT_DIR}/release-dist"
VERSION="${OPENCODE_VERSION:-v1.0.0}"

echo "╔═══════════════════════════════════════╗"
echo "║   OpenCode 简化版打包脚本             ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "版本: ${VERSION}"
echo ""

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}/opencode"

# 1. 复制前端
echo "=== 复制前端 ==="
mkdir -p "${DIST_DIR}/opencode/web"
cp -a "${ROOT_DIR}/opencode-pro/packages/app/dist/"* "${DIST_DIR}/opencode/web/"

# 2. 复制 cc-switch-server (当前平台)
echo "=== 复制 cc-switch-server ==="
mkdir -p "${DIST_DIR}/opencode/bin"
if [[ -f "${ROOT_DIR}/cc-switch-main/src-tauri/target/release/cc-switch-server" ]]; then
  cp "${ROOT_DIR}/cc-switch-main/src-tauri/target/release/cc-switch-server" "${DIST_DIR}/opencode/bin/"
else
  echo "警告: cc-switch-server 未找到，跳过"
fi

# 3. 复制后端源码
echo "=== 复制后端源码 ==="
mkdir -p "${DIST_DIR}/opencode/backend"
cp -a "${ROOT_DIR}/opencode-dev/packages/opencode/src" "${DIST_DIR}/opencode/backend/"
cp "${ROOT_DIR}/opencode-dev/packages/opencode/package.json" "${DIST_DIR}/opencode/backend/"
cp "${ROOT_DIR}/opencode-dev/packages/opencode/tsconfig.json" "${DIST_DIR}/opencode/backend/" 2>/dev/null || true

# 4. 复制配置文件
echo "=== 复制配置文件 ==="
cp "${ROOT_DIR}/.env.example" "${DIST_DIR}/opencode/" 2>/dev/null || \
  echo "OPENCODE_SERVER_PASSWORD=" > "${DIST_DIR}/opencode/.env.example"

# 5. 复制 systemd 服务文件
mkdir -p "${DIST_DIR}/opencode/systemd"
cp "${ROOT_DIR}/packaging/systemd/opencode.service" "${DIST_DIR}/opencode/systemd/" 2>/dev/null || true

# 6. 创建启动脚本
cat > "${DIST_DIR}/opencode/start.sh" << 'STARTEOF'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查 Bun
if ! command -v bun >/dev/null 2>&1; then
  echo "安装 Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="${HOME}/.bun/bin:${PATH}"
fi

# 安装依赖
cd "${SCRIPT_DIR}/backend"
bun install

# 启动服务
export OPENCODE_WEB_ROOT="${SCRIPT_DIR}/web"
export CC_SWITCH_SERVER_PATH="${SCRIPT_DIR}/bin/cc-switch-server"
export CC_SWITCH_PORT="${CC_SWITCH_PORT:-8766}"

exec bun run --conditions=browser src/index.ts serve \
  --mode "${OPENCODE_MODE:-prod}" \
  --hostname "${OPENCODE_HOST:-0.0.0.0}" \
  --port "${OPENCODE_PORT:-4096}"
STARTEOF
chmod +x "${DIST_DIR}/opencode/start.sh"

# 7. 创建安装脚本
cat > "${DIST_DIR}/opencode/install.sh" << 'INSTALLEOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "需要 root 权限 (使用 sudo)"
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/opt/opencode"

echo "安装到 ${TARGET_DIR}..."
mkdir -p "${TARGET_DIR}"
cp -a "${SRC_DIR}/"* "${TARGET_DIR}/"

if [[ ! -f "${TARGET_DIR}/.env" ]]; then
  cp "${TARGET_DIR}/.env.example" "${TARGET_DIR}/.env"
  chmod 600 "${TARGET_DIR}/.env"
fi

chmod +x "${TARGET_DIR}/start.sh"
chmod +x "${TARGET_DIR}/bin/"* 2>/dev/null || true

# 安装 systemd 服务
if command -v systemctl >/dev/null 2>&1; then
  cp "${TARGET_DIR}/systemd/opencode.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable opencode.service
  systemctl start opencode.service
  echo "服务已启动: systemctl status opencode"
fi

echo ""
echo "安装完成！"
echo "Web: http://localhost:4096"
echo "API: http://localhost:4096/api"
echo ""
echo "下一步: 编辑 ${TARGET_DIR}/.env 设置密码"
INSTALLEOF
chmod +x "${DIST_DIR}/opencode/install.sh"

# 8. 检测平台并打包
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
[[ "${ARCH}" == "x86_64" ]] && ARCH="x64"
[[ "${ARCH}" == "aarch64" ]] && ARCH="arm64"
PLATFORM="${OS}-${ARCH}"

PKG_NAME="opencode-selfhost_${PLATFORM}"

echo "=== 打包 ${PKG_NAME} ==="
(
  cd "${DIST_DIR}"
  tar -czf "${PKG_NAME}.tar.gz" opencode
)

# 9. 生成校验和
echo "=== 生成校验和 ==="
(
  cd "${DIST_DIR}"
  shasum -a 256 *.tar.gz > SHA256SUMS 2>/dev/null || sha256sum *.tar.gz > SHA256SUMS
)

echo ""
echo "========================================="
echo "打包完成！"
echo "输出: ${DIST_DIR}/${PKG_NAME}.tar.gz"
echo ""
ls -lh "${DIST_DIR}/"*.tar.gz
echo ""

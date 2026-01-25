#!/usr/bin/env bash
set -euo pipefail

# OpenCode 多平台打包脚本
# 支持在 Mac 上交叉编译 Linux 版本
#
# 用法:
#   ./pack-multiplatform.sh                    # 构建当前平台
#   ./pack-multiplatform.sh --all              # 构建所有平台
#   ./pack-multiplatform.sh --platform linux-x64 --platform linux-arm64

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${ROOT_DIR}/release-dist"
VERSION="${OPENCODE_VERSION:-v1.0.0}"

# 支持的平台
ALL_PLATFORMS=("darwin-arm64" "darwin-x64" "linux-x64" "linux-arm64")
PLATFORMS=()
BUILD_ALL=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all)
        BUILD_ALL=true
        shift
        ;;
      --platform)
        PLATFORMS+=("$2")
        shift 2
        ;;
      --version)
        VERSION="$2"
        shift 2
        ;;
      *)
        error "未知参数: $1"
        exit 1
        ;;
    esac
  done

  if [[ ${#PLATFORMS[@]} -eq 0 ]]; then
    if [[ "${BUILD_ALL}" == "true" ]]; then
      PLATFORMS=("${ALL_PLATFORMS[@]}")
    else
      # 默认当前平台
      local os arch
      os="$(uname -s | tr '[:upper:]' '[:lower:]')"
      arch="$(uname -m)"
      [[ "${arch}" == "x86_64" ]] && arch="x64"
      [[ "${arch}" == "aarch64" ]] && arch="arm64"
      PLATFORMS=("${os}-${arch}")
    fi
  fi
}

build_frontend() {
  info "构建前端..."
  if [[ -f "${ROOT_DIR}/opencode-pro/packages/app/dist/index.html" ]]; then
    info "前端已构建，跳过"
    return 0
  fi
  (
    cd "${ROOT_DIR}/opencode-pro"
    bun install
    bun run build
  )
}

build_opencode_for_platform() {
  local platform="$1"
  local out_dir="${DIST_DIR}/${platform}/bin"
  mkdir -p "${out_dir}"

  info "构建 opencode 二进制 (${platform})..."

  local os arch bun_target
  os="${platform%-*}"
  arch="${platform#*-}"
  bun_target="bun-${os}-${arch}"

  (
    cd "${ROOT_DIR}/opencode-dev/packages/opencode"

    # Bun 支持交叉编译
    bun build \
      --compile \
      --target="${bun_target}" \
      --outfile="${out_dir}/opencode" \
      --conditions=browser \
      ./src/index.ts 2>&1 || {
        warn "bun build --compile 失败，尝试备用方案..."
        return 1
      }
  )

  if [[ -f "${out_dir}/opencode" ]]; then
    info "opencode 构建成功: ${out_dir}/opencode"
    return 0
  fi
  return 1
}

build_cc_switch_for_platform() {
  local platform="$1"
  local out_dir="${DIST_DIR}/${platform}/bin"
  mkdir -p "${out_dir}"

  info "构建 cc-switch-server (${platform})..."

  local rust_target
  case "${platform}" in
    linux-x64)    rust_target="x86_64-unknown-linux-gnu" ;;
    linux-arm64)  rust_target="aarch64-unknown-linux-gnu" ;;
    darwin-x64)   rust_target="x86_64-apple-darwin" ;;
    darwin-arm64) rust_target="aarch64-apple-darwin" ;;
    *)            error "不支持的平台: ${platform}"; return 1 ;;
  esac

  local current_os current_arch
  current_os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  current_arch="$(uname -m)"
  [[ "${current_arch}" == "x86_64" ]] && current_arch="x64"
  [[ "${current_arch}" == "aarch64" ]] && current_arch="arm64"
  local current_platform="${current_os}-${current_arch}"

  (
    cd "${ROOT_DIR}/cc-switch-main/src-tauri"

    if [[ "${platform}" == "${current_platform}" ]]; then
      # 本地编译
      cargo build --release --bin cc-switch-server
      cp "target/release/cc-switch-server" "${out_dir}/"
    elif [[ "${platform}" == linux-* ]]; then
      # Linux 交叉编译使用 cross (需要 Docker)
      if command -v cross >/dev/null 2>&1 && command -v docker >/dev/null 2>&1; then
        info "使用 cross 交叉编译到 ${rust_target}..."
        cross build --release --bin cc-switch-server --target="${rust_target}" 2>&1 || {
          warn "cross 编译失败，跳过 cc-switch-server"
          return 0
        }
        cp "target/${rust_target}/release/cc-switch-server" "${out_dir}/"
      else
        warn "cross 或 Docker 未安装，跳过 Linux cc-switch-server"
        return 0
      fi
    else
      # macOS 交叉编译
      rustup target add "${rust_target}" 2>/dev/null || true
      cargo build --release --bin cc-switch-server --target="${rust_target}" 2>&1 || {
        warn "交叉编译失败，跳过 ${platform} 的 cc-switch-server"
        return 0
      }
      cp "target/${rust_target}/release/cc-switch-server" "${out_dir}/"
    fi
  )

  if [[ -f "${out_dir}/cc-switch-server" ]]; then
    info "cc-switch-server 构建成功"
  fi
}

package_platform() {
  local platform="$1"
  local pkg_dir="${DIST_DIR}/${platform}"
  local pkg_name="opencode-selfhost_${platform}"

  info "打包 ${platform}..."

  # 复制前端
  mkdir -p "${pkg_dir}/web"
  cp -a "${ROOT_DIR}/opencode-pro/packages/app/dist/"* "${pkg_dir}/web/"

  # 复制后端源码（作为备用）
  mkdir -p "${pkg_dir}/backend"
  cp -a "${ROOT_DIR}/opencode-dev/packages/opencode/src" "${pkg_dir}/backend/"
  cp "${ROOT_DIR}/opencode-dev/packages/opencode/package.json" "${pkg_dir}/backend/"

  # 复制配置文件
  cp "${ROOT_DIR}/.env.example" "${pkg_dir}/" 2>/dev/null || \
    echo "OPENCODE_SERVER_PASSWORD=" > "${pkg_dir}/.env.example"

  # 复制 systemd 服务文件
  mkdir -p "${pkg_dir}/systemd"
  cp "${ROOT_DIR}/packaging/systemd/opencode.service" "${pkg_dir}/systemd/" 2>/dev/null || true

  # 创建启动脚本
  cat > "${pkg_dir}/start.sh" << 'STARTEOF'
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
STARTEOF
  chmod +x "${pkg_dir}/start.sh"

  # 创建安装脚本
  cat > "${pkg_dir}/install.sh" << 'INSTALLEOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "需要 root 权限 (使用 sudo)"; exit 1
fi
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/opt/opencode"
echo "安装到 ${TARGET_DIR}..."
mkdir -p "${TARGET_DIR}"
cp -a "${SRC_DIR}/"* "${TARGET_DIR}/"
[[ ! -f "${TARGET_DIR}/.env" ]] && cp "${TARGET_DIR}/.env.example" "${TARGET_DIR}/.env" && chmod 600 "${TARGET_DIR}/.env"
chmod +x "${TARGET_DIR}/start.sh" "${TARGET_DIR}/bin/"* 2>/dev/null || true
if command -v systemctl >/dev/null 2>&1 && [[ -f "${TARGET_DIR}/systemd/opencode.service" ]]; then
  cp "${TARGET_DIR}/systemd/opencode.service" /etc/systemd/system/
  systemctl daemon-reload && systemctl enable --now opencode.service
  echo "服务已启动: systemctl status opencode"
fi
echo -e "\n安装完成！\nWeb: http://localhost:4096\nAPI: http://localhost:4096/api\n\n下一步: 编辑 ${TARGET_DIR}/.env 设置密码"
INSTALLEOF
  chmod +x "${pkg_dir}/install.sh"

  # 打包
  (
    cd "${DIST_DIR}"
    mv "${platform}" "opencode"
    tar -czf "${pkg_name}.tar.gz" "opencode"
    mv "opencode" "${platform}"
  )

  info "已创建: ${DIST_DIR}/${pkg_name}.tar.gz"
}

main() {
  parse_args "$@"

  echo ""
  echo "╔═══════════════════════════════════════════╗"
  echo "║   OpenCode 多平台打包脚本                 ║"
  echo "╚═══════════════════════════════════════════╝"
  echo ""
  echo "版本: ${VERSION}"
  echo "目标平台: ${PLATFORMS[*]}"
  echo ""

  rm -rf "${DIST_DIR}"
  mkdir -p "${DIST_DIR}"

  # 构建前端（只需一次）
  build_frontend

  # 安装后端依赖
  info "安装后端依赖..."
  (cd "${ROOT_DIR}/opencode-dev/packages/opencode" && bun install)

  # 为每个平台构建
  for platform in "${PLATFORMS[@]}"; do
    echo ""
    echo "=========================================="
    info "构建平台: ${platform}"
    echo "=========================================="

    build_opencode_for_platform "${platform}" || warn "opencode 构建失败"
    build_cc_switch_for_platform "${platform}" || warn "cc-switch-server 构建失败"
    package_platform "${platform}"
  done

  # 生成校验和
  info "生成校验和..."
  (
    cd "${DIST_DIR}"
    shasum -a 256 *.tar.gz > SHA256SUMS 2>/dev/null || sha256sum *.tar.gz > SHA256SUMS
  )

  echo ""
  echo "=========================================="
  echo -e "${GREEN}打包完成！${NC}"
  echo "=========================================="
  echo ""
  echo "输出目录: ${DIST_DIR}"
  echo ""
  ls -lh "${DIST_DIR}"/*.tar.gz
  echo ""
  cat "${DIST_DIR}/SHA256SUMS"
  echo ""
}

main "$@"

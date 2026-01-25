#!/usr/bin/env bash
set -euo pipefail

# OpenCode Release 构建脚本
# 用法:
#   ./build-release.sh                    # 构建当前平台
#   ./build-release.sh --all              # 构建所有平台 (需要交叉编译工具)
#   ./build-release.sh --platform linux-x64

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${ROOT_DIR}/release-dist"
VERSION="${OPENCODE_VERSION:-$(date +%Y%m%d)}"

PLATFORMS=()
BUILD_ALL=false

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
        echo "未知参数: $1"
        exit 1
        ;;
    esac
  done

  if [[ ${#PLATFORMS[@]} -eq 0 ]]; then
    if [[ "${BUILD_ALL}" == "true" ]]; then
      PLATFORMS=("linux-x64" "linux-arm64" "darwin-x64" "darwin-arm64")
    else
      local os arch
      os="$(uname -s | tr '[:upper:]' '[:lower:]')"
      arch="$(uname -m)"
      [[ "${os}" == "darwin" ]] || os="linux"
      [[ "${arch}" == "x86_64" ]] && arch="x64"
      [[ "${arch}" == "aarch64" ]] && arch="arm64"
      PLATFORMS=("${os}-${arch}")
    fi
  fi
}

ensure_deps() {
  if ! command -v bun >/dev/null 2>&1; then
    echo "安装 Bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="${HOME}/.bun/bin:${PATH}"
  fi

  if ! command -v cargo >/dev/null 2>&1; then
    echo "安装 Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    export PATH="${HOME}/.cargo/bin:${PATH}"
  fi
}

build_frontend() {
  echo "=== 构建前端 ==="
  (
    cd "${ROOT_DIR}/opencode-pro"
    bun install
    bun run build
  )
}

build_opencode_binary() {
  local platform="$1"
  echo "=== 构建 opencode 二进制 (${platform}) ==="

  local os arch
  os="${platform%-*}"
  arch="${platform#*-}"

  local out_dir="${DIST_DIR}/${platform}/bin"
  mkdir -p "${out_dir}"

  (
    cd "${ROOT_DIR}/opencode-dev/packages/opencode"
    bun install

    # 检查是否已有构建好的二进制
    local existing_bin
    existing_bin="$(find dist -maxdepth 2 -name 'opencode' -type f 2>/dev/null | head -1)"

    if [[ -n "${existing_bin}" ]]; then
      echo "使用已有的构建产物: ${existing_bin}"
      cp "${existing_bin}" "${out_dir}/"
      return 0
    fi

    # 尝试使用 bun build 的 compile 功能
    local bun_target="bun-${os}-${arch}"

    bun build \
      --conditions=browser \
      --compile \
      --target="${bun_target}" \
      --outfile="${out_dir}/opencode" \
      ./src/index.ts 2>/dev/null || {
        echo "警告: bun build --compile 失败，尝试使用项目构建脚本..."
        # 跳过版本检查，直接运行构建
        SKIP_VERSION_CHECK=1 bun run script/build.ts --single --skip-install 2>/dev/null || \
          bun run script/build.ts --single --skip-install 2>/dev/null || true

        local built_dir
        built_dir="$(find dist -maxdepth 1 -type d -name "*${os}*${arch}*" 2>/dev/null | head -1)"
        if [[ -n "${built_dir}" && -f "${built_dir}/bin/opencode" ]]; then
          cp "${built_dir}/bin/opencode" "${out_dir}/"
        else
          echo "错误: 无法构建 opencode 二进制文件"
          return 1
        fi
      }
  )
}

build_cc_switch() {
  local platform="$1"
  echo "=== 构建 cc-switch-server (${platform}) ==="

  local os arch rust_target
  os="${platform%-*}"
  arch="${platform#*-}"

  case "${platform}" in
    linux-x64)    rust_target="x86_64-unknown-linux-gnu" ;;
    linux-arm64)  rust_target="aarch64-unknown-linux-gnu" ;;
    darwin-x64)   rust_target="x86_64-apple-darwin" ;;
    darwin-arm64) rust_target="aarch64-apple-darwin" ;;
    *)            echo "不支持的平台: ${platform}"; return 1 ;;
  esac

  local out_dir="${DIST_DIR}/${platform}/bin"
  mkdir -p "${out_dir}"

  (
    cd "${ROOT_DIR}/cc-switch-main/src-tauri"

    # 检查是否需要交叉编译
    local current_target
    current_target="$(rustc -vV | grep host | cut -d' ' -f2)"

    if [[ "${rust_target}" == "${current_target}" ]]; then
      cargo build --release --bin cc-switch-server
      cp "target/release/cc-switch-server" "${out_dir}/"
    else
      echo "交叉编译到 ${rust_target}..."
      rustup target add "${rust_target}" 2>/dev/null || true
      cargo build --release --bin cc-switch-server --target="${rust_target}" || {
        echo "警告: 交叉编译失败，跳过 ${platform} 的 cc-switch-server"
        return 0
      }
      cp "target/${rust_target}/release/cc-switch-server" "${out_dir}/"
    fi
  )
}

package_release() {
  local platform="$1"
  echo "=== 打包 ${platform} ==="

  local pkg_dir="${DIST_DIR}/${platform}"
  local pkg_name="opencode-selfhost_${platform}"

  mkdir -p "${pkg_dir}/web"
  mkdir -p "${pkg_dir}/systemd"

  # 复制前端
  cp -a "${ROOT_DIR}/opencode-pro/packages/app/dist/"* "${pkg_dir}/web/"

  # 复制 systemd 服务文件
  if [[ -f "${ROOT_DIR}/packaging/systemd/opencode.service" ]]; then
    cp "${ROOT_DIR}/packaging/systemd/opencode.service" "${pkg_dir}/systemd/"
  else
    # 创建默认的 systemd 服务文件
    cat > "${pkg_dir}/systemd/opencode.service" << 'EOF'
[Unit]
Description=OpenCode Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/opencode
EnvironmentFile=-/opt/opencode/.env
ExecStart=/opt/opencode/bin/opencode serve --hostname 0.0.0.0 --port 4096
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  fi

  # 复制 .env.example
  cp "${ROOT_DIR}/.env.example" "${pkg_dir}/" 2>/dev/null || \
    echo "OPENCODE_SERVER_PASSWORD=" > "${pkg_dir}/.env.example"

  # 创建 tarball
  (
    cd "${DIST_DIR}"
    mv "${platform}" "opencode"
    tar -czf "${pkg_name}.tar.gz" "opencode"
    mv "opencode" "${platform}"
  )

  echo "已创建: ${DIST_DIR}/${pkg_name}.tar.gz"
}

generate_checksums() {
  echo "=== 生成校验和 ==="
  (
    cd "${DIST_DIR}"
    sha256sum *.tar.gz > SHA256SUMS 2>/dev/null || \
      shasum -a 256 *.tar.gz > SHA256SUMS
  )
  echo "已创建: ${DIST_DIR}/SHA256SUMS"
}

main() {
  parse_args "$@"

  echo "╔═══════════════════════════════════════╗"
  echo "║     OpenCode Release 构建脚本         ║"
  echo "╚═══════════════════════════════════════╝"
  echo ""
  echo "版本: ${VERSION}"
  echo "目标平台: ${PLATFORMS[*]}"
  echo ""

  ensure_deps

  rm -rf "${DIST_DIR}"
  mkdir -p "${DIST_DIR}"

  build_frontend

  for platform in "${PLATFORMS[@]}"; do
    echo ""
    echo "========== 构建 ${platform} =========="
    build_opencode_binary "${platform}"
    build_cc_switch "${platform}"
    package_release "${platform}"
  done

  generate_checksums

  echo ""
  echo "========================================="
  echo "构建完成！"
  echo "输出目录: ${DIST_DIR}"
  echo ""
  ls -lh "${DIST_DIR}"/*.tar.gz
  echo ""
}

main "$@"

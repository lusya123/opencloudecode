#!/usr/bin/env bash
set -euo pipefail

# OpenCode 一键安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/lusya123/opencloudecode/main/install.sh | bash
#
# 环境变量:
#   OPENCODE_INSTALL_DIR  - 安装目录 (默认: /opt/opencode 或 ~/.opencode)
#   OPENCODE_VERSION      - 指定版本 (默认: latest)
#   OPENCODE_NO_SYSTEMD   - 设为 1 跳过 systemd 安装

REPO="lusya123/opencloudecode"
INSTALL_DIR="${OPENCODE_INSTALL_DIR:-}"
VERSION="${OPENCODE_VERSION:-latest}"
NO_SYSTEMD="${OPENCODE_NO_SYSTEMD:-0}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "${os}" in
    Linux)  OS="linux" ;;
    Darwin) OS="darwin" ;;
    *)      error "不支持的操作系统: ${os}" ;;
  esac

  case "${arch}" in
    x86_64|amd64)   ARCH="x64" ;;
    arm64|aarch64)  ARCH="arm64" ;;
    *)              error "不支持的架构: ${arch}" ;;
  esac

  PLATFORM="${OS}-${ARCH}"
  info "检测到平台: ${PLATFORM}"
}

detect_install_dir() {
  if [[ -n "${INSTALL_DIR}" ]]; then
    return
  fi

  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    INSTALL_DIR="/opt/opencode"
  else
    INSTALL_DIR="${HOME}/.opencode"
  fi
}

get_download_url() {
  local base_url="https://github.com/${REPO}/releases"
  local filename="opencode-selfhost_${PLATFORM}.tar.gz"

  if [[ "${VERSION}" == "latest" ]]; then
    DOWNLOAD_URL="${base_url}/latest/download/${filename}"
  else
    DOWNLOAD_URL="${base_url}/download/${VERSION}/${filename}"
  fi
}

download_and_extract() {
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  trap "rm -rf '${tmp_dir}'" EXIT

  info "下载 ${DOWNLOAD_URL}..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "${DOWNLOAD_URL}" -o "${tmp_dir}/opencode.tar.gz"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "${DOWNLOAD_URL}" -O "${tmp_dir}/opencode.tar.gz"
  else
    error "需要 curl 或 wget"
  fi

  info "解压到 ${INSTALL_DIR}..."
  mkdir -p "${INSTALL_DIR}"
  tar -xzf "${tmp_dir}/opencode.tar.gz" -C "${tmp_dir}"

  local extracted_dir
  extracted_dir="$(find "${tmp_dir}" -maxdepth 1 -type d -name 'opencode*' | head -1)"
  if [[ -z "${extracted_dir}" ]]; then
    extracted_dir="${tmp_dir}"
  fi

  cp -a "${extracted_dir}/bin" "${INSTALL_DIR}/" 2>/dev/null || true
  cp -a "${extracted_dir}/web" "${INSTALL_DIR}/" 2>/dev/null || true
  cp -a "${extracted_dir}/.env.example" "${INSTALL_DIR}/" 2>/dev/null || true
  cp -a "${extracted_dir}/systemd" "${INSTALL_DIR}/" 2>/dev/null || true

  if [[ ! -f "${INSTALL_DIR}/.env" && -f "${INSTALL_DIR}/.env.example" ]]; then
    cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
    chmod 600 "${INSTALL_DIR}/.env" 2>/dev/null || true
  fi

  chmod +x "${INSTALL_DIR}/bin/"* 2>/dev/null || true
}

install_systemd() {
  if [[ "${NO_SYSTEMD}" == "1" ]]; then
    warn "跳过 systemd 安装"
    return
  fi

  if [[ "${OS}" != "linux" ]]; then
    info "非 Linux 系统，跳过 systemd 安装"
    return
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl 不可用，跳过 systemd 安装"
    return
  fi

  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    warn "非 root 用户，跳过 systemd 安装。如需 systemd 服务，请使用 sudo 运行"
    return
  fi

  local service_src="${INSTALL_DIR}/systemd/opencode.service"
  local service_dst="/etc/systemd/system/opencode.service"

  if [[ -f "${service_src}" ]]; then
    info "安装 systemd 服务..."
    cp "${service_src}" "${service_dst}"
    systemctl daemon-reload
    systemctl enable opencode.service
    info "启动服务..."
    systemctl start opencode.service
  else
    warn "未找到 systemd 服务文件"
  fi
}

print_success() {
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  OpenCode 安装完成！${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo "安装目录: ${INSTALL_DIR}"
  echo ""

  if [[ "${OS}" == "linux" ]] && [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    echo "服务状态: systemctl status opencode"
    echo "查看日志: journalctl -u opencode -f"
  else
    echo "启动服务: ${INSTALL_DIR}/bin/opencode serve"
  fi

  echo ""
  echo "访问地址:"
  echo "  Web: http://localhost:4096"
  echo "  API: http://localhost:4096/api"
  echo ""
  echo "下一步:"
  echo "  1. 编辑 ${INSTALL_DIR}/.env 设置 OPENCODE_SERVER_PASSWORD"
  echo "  2. 重启服务使配置生效"
  echo ""
}

main() {
  echo ""
  echo "╔═══════════════════════════════════════╗"
  echo "║     OpenCode 一键安装脚本             ║"
  echo "╚═══════════════════════════════════════╝"
  echo ""

  detect_platform
  detect_install_dir
  get_download_url
  download_and_extract
  install_systemd
  print_success
}

main "$@"

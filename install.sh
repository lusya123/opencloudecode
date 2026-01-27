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
  cp -a "${extracted_dir}/backend" "${INSTALL_DIR}/" 2>/dev/null || true
  cp -a "${extracted_dir}/start.sh" "${INSTALL_DIR}/" 2>/dev/null || true
  cp -a "${extracted_dir}/install.sh" "${INSTALL_DIR}/pkg-install.sh" 2>/dev/null || true

  if [[ ! -f "${INSTALL_DIR}/.env" && -f "${INSTALL_DIR}/.env.example" ]]; then
    cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
    chmod 600 "${INSTALL_DIR}/.env" 2>/dev/null || true
  fi

  chmod +x "${INSTALL_DIR}/bin/"* 2>/dev/null || true
}

install_dependencies() {
  # 检查二进制文件是否存在
  if [[ ! -f "${INSTALL_DIR}/bin/opencode" ]]; then
    info "未找到二进制文件，跳过依赖检查"
    return
  fi

  # 检查是否需要 musl
  if ldd "${INSTALL_DIR}/bin/opencode" 2>&1 | grep -q "musl.*not found"; then
    info "检测到需要 musl 库..."

    if [[ "${OS}" == "linux" ]]; then
      # 检测 Linux 发行版
      if command -v apt-get >/dev/null 2>&1; then
        # Debian/Ubuntu
        info "安装 musl 依赖 (Debian/Ubuntu)..."
        if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
          apt-get update -qq && apt-get install -y -qq musl >/dev/null 2>&1 || warn "musl 安装失败，服务可能无法启动"
        else
          warn "需要 root 权限安装 musl。请运行: sudo apt-get install -y musl"
        fi
      elif command -v yum >/dev/null 2>&1; then
        # CentOS/RHEL
        info "安装 musl 依赖 (CentOS/RHEL)..."
        if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
          yum install -y musl >/dev/null 2>&1 || warn "musl 安装失败，服务可能无法启动"
        else
          warn "需要 root 权限安装 musl。请运行: sudo yum install -y musl"
        fi
      elif command -v apk >/dev/null 2>&1; then
        # Alpine
        info "安装 musl 依赖 (Alpine)..."
        if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
          apk add --no-cache musl >/dev/null 2>&1 || warn "musl 安装失败，服务可能无法启动"
        else
          warn "需要 root 权限安装 musl。请运行: sudo apk add musl"
        fi
      else
        warn "无法识别的 Linux 发行版，请手动安装 musl"
      fi
    fi
  fi

  # 验证依赖是否满足
  if ldd "${INSTALL_DIR}/bin/opencode" 2>&1 | grep -q "not found"; then
    warn "检测到缺少依赖库，服务可能无法启动"
    warn "请查看: ldd ${INSTALL_DIR}/bin/opencode"
  fi
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

start_service() {
  # 如果是 root 用户且使用了 systemd，则已经启动了服务
  if [[ "${OS}" == "linux" ]] && [[ "${EUID:-$(id -u)}" -eq 0 ]] && [[ "${NO_SYSTEMD}" != "1" ]]; then
    return
  fi

  # 对于非 root 用户或非 Linux 系统，使用 nohup 后台启动
  if [[ ! -x "${INSTALL_DIR}/start.sh" ]]; then
    warn "启动脚本不存在或无执行权限"
    return
  fi

  info "启动 OpenCode 服务..."

  # 创建日志目录
  mkdir -p "${INSTALL_DIR}/logs"

  # 停止可能存在的旧进程
  if [[ -f "${INSTALL_DIR}/opencode.pid" ]]; then
    local old_pid
    old_pid="$(cat "${INSTALL_DIR}/opencode.pid" 2>/dev/null || true)"
    if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
      info "停止旧的服务进程 (PID: ${old_pid})..."
      kill "${old_pid}" 2>/dev/null || true
      sleep 2
    fi
  fi

  # 后台启动服务
  cd "${INSTALL_DIR}"
  nohup "${INSTALL_DIR}/start.sh" > "${INSTALL_DIR}/logs/opencode.log" 2>&1 &
  local pid=$!
  echo "${pid}" > "${INSTALL_DIR}/opencode.pid"

  # 等待服务启动
  sleep 3

  # 检查服务是否成功启动
  if kill -0 "${pid}" 2>/dev/null; then
    info "服务已启动 (PID: ${pid})"
  else
    warn "服务启动可能失败，请查看日志: ${INSTALL_DIR}/logs/opencode.log"
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

  if [[ "${OS}" == "linux" ]] && [[ "${EUID:-$(id -u)}" -eq 0 ]] && [[ "${NO_SYSTEMD}" != "1" ]]; then
    echo "服务状态: systemctl status opencode"
    echo "查看日志: journalctl -u opencode -f"
    echo "停止服务: systemctl stop opencode"
  else
    echo "服务状态: ps aux | grep opencode"
    echo "查看日志: tail -f ${INSTALL_DIR}/logs/opencode.log"
    echo "停止服务: kill \$(cat ${INSTALL_DIR}/opencode.pid)"
    echo "重启服务: ${INSTALL_DIR}/start.sh"
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
  install_dependencies
  install_systemd
  start_service
  print_success
}

main "$@"

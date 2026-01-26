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

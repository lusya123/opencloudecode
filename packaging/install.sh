#!/usr/bin/env bash
set -euo pipefail

# Run this script inside the extracted release directory (the one that contains bin/ and web/).
#
# Example:
#   tar -xzf opencode-selfhost_1.2.3_linux-x64.tar.gz
#   cd opencode
#   sudo ./install.sh

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "This installer needs root (use sudo)."
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/opt/opencode"
SYSTEMD_UNIT_SRC="${SRC_DIR}/systemd/opencode.service"
SYSTEMD_UNIT_DST="/etc/systemd/system/opencode.service"

require_path() {
  if [[ ! -e "$1" ]]; then
    echo "Missing required path: $1"
    exit 1
  fi
}

require_path "${SRC_DIR}/bin"
require_path "${SRC_DIR}/web"
require_path "${SYSTEMD_UNIT_SRC}"

mkdir -p "${TARGET_DIR}"

echo "Installing files to ${TARGET_DIR}..."
rm -rf "${TARGET_DIR}/bin" "${TARGET_DIR}/web"
cp -a "${SRC_DIR}/bin" "${SRC_DIR}/web" "${TARGET_DIR}/"

if [[ -f "${SRC_DIR}/.env.example" && ! -f "${TARGET_DIR}/.env" ]]; then
  echo "Creating ${TARGET_DIR}/.env from .env.example"
  cp "${SRC_DIR}/.env.example" "${TARGET_DIR}/.env"
  chmod 600 "${TARGET_DIR}/.env" || true
fi

echo "Installing systemd unit..."
cp "${SYSTEMD_UNIT_SRC}" "${SYSTEMD_UNIT_DST}"
systemctl daemon-reload
systemctl enable --now opencode.service

echo ""
echo "Installed."
echo "Web: http://<server>:4096"
echo "API: http://<server>:4096/api"
echo ""
echo "Next:"
echo "- Edit ${TARGET_DIR}/.env and set OPENCODE_SERVER_PASSWORD"
echo "- systemctl restart opencode"

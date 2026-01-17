#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Downgrade a CC Switch database (schema v3) into a CC Switch 3.8.3-compatible DB (schema v1).

Usage:
  cc-switch-main/scripts/downgrade-db-to-3.8.3-schema.sh <SRC_DB> <TARGET_DB>

Notes:
  - TARGET_DB should be a database created by CC Switch 3.8.3 (so the schema matches).
  - The script overwrites data in TARGET_DB tables (after backing up TARGET_DB).
  - Only columns that exist in the 3.8.3 schema are kept.
EOF
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
  usage
  exit 0
fi

SRC_DB=${1:-}
TARGET_DB=${2:-}

if [[ -z "$SRC_DB" || -z "$TARGET_DB" ]]; then
  usage
  exit 1
fi

if [[ ! -f "$SRC_DB" ]]; then
  echo "SRC_DB not found: $SRC_DB" >&2
  exit 1
fi

if [[ ! -f "$TARGET_DB" ]]; then
  echo "TARGET_DB not found: $TARGET_DB" >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
BACKUP="${TARGET_DB}.before-downgrade-${TS}"
cp "$TARGET_DB" "$BACKUP"
echo "Backup created: $BACKUP"

sqlite3 "$TARGET_DB" <<SQL
ATTACH '$SRC_DB' AS src;
PRAGMA foreign_keys=OFF;
BEGIN;
DELETE FROM provider_endpoints;
DELETE FROM providers;
DELETE FROM settings;
DELETE FROM mcp_servers;
DELETE FROM skill_repos;
DELETE FROM prompts;
DELETE FROM skills;

INSERT INTO providers (
  id, app_type, name, settings_config, website_url, category, created_at, sort_index, notes, icon, icon_color, meta, is_current
)
SELECT
  id, app_type, name, settings_config, website_url, category, created_at, sort_index, notes, icon, icon_color, meta, is_current
FROM src.providers;

INSERT INTO provider_endpoints (id, provider_id, app_type, url, added_at)
SELECT id, provider_id, app_type, url, added_at
FROM src.provider_endpoints;

INSERT INTO mcp_servers (id, name, server_config, description, homepage, docs, tags, enabled_claude, enabled_codex, enabled_gemini)
SELECT id, name, server_config, description, homepage, docs, tags, enabled_claude, enabled_codex, enabled_gemini
FROM src.mcp_servers;

INSERT INTO skill_repos (owner, name, branch, enabled)
SELECT owner, name, branch, enabled
FROM src.skill_repos;

INSERT INTO prompts (id, app_type, name, content, description, enabled, created_at, updated_at)
SELECT id, app_type, name, content, description, enabled, created_at, updated_at
FROM src.prompts;

INSERT INTO settings (key, value)
SELECT key, value
FROM src.settings;

-- 3.9+ skills table differs; keep only installation markers.
INSERT INTO skills (key, installed, installed_at)
SELECT id, 1, installed_at
FROM src.skills;

COMMIT;
DETACH src;
PRAGMA foreign_keys=ON;
SQL

echo "Done."

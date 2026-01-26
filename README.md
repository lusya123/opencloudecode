# OpenCodePro Self-Hosted (Linux)

这个仓库包含 3 个核心组件：

- `opencode-dev/`：后端（Bun + Hono），对外提供 API（前缀 `/api`），并自动拉起 `cc-switch-server`
- `opencode-pro/`：前端（SolidJS + Vite），构建产物为静态站点
- `cc-switch-main/`：`cc-switch-server`（Rust），用于在 Linux 上管理/切换 Claude Code 提供商配置

## 一键启动（从源码）

```bash
chmod +x deploy.sh start-services.sh stop-services.sh
./deploy.sh prod
```

- Web：`http://<server>:4096`
- API：`http://<server>:4096/api`

更完整说明见 `LINUX_DEPLOY.md`，发布 Release 的推荐形态见 `RELEASE.md`。


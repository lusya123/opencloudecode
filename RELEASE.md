# GitHub Release 建议（Linux 一键部署）

目标：让用户在 Linux 服务器上“下载一个 Release → 一条命令安装 → systemd 自启 → 浏览器访问”。

## 1) Release 应该是什么形态？

推荐给每个目标平台发布一个自包含的 tarball（至少 `linux-x64` / `linux-arm64`）：

```
opencode-selfhost_<version>_linux-x64.tar.gz
└── opencode/
    ├── bin/
    │   ├── opencode              # 后端（建议用 Bun compile 产物）
    │   └── cc-switch-server      # Rust 可执行文件
    ├── web/                      # 前端静态文件（Vite build 的 dist）
    │   ├── index.html
    │   └── assets/...
    ├── systemd/
    │   └── opencode.service
    ├── .env.example
    └── install.sh                # 一键安装到 /opt/opencode 并启用 systemd
```

同时建议额外附带：

- `SHA256SUMS`：每个 tarball 的校验和
- `SBOM`（可选）：软件物料清单（对企业用户更友好）

仓库里已提供可直接复用的模板：

- `packaging/systemd/opencode.service`
- `packaging/install.sh`

## 2) 如何引导用户使用和快速启动？

Release 页面建议放一段“复制粘贴即可用”的 Quick Start：

```bash
curl -fsSL https://github.com/<org>/<repo>/releases/latest/download/install.sh | bash
```

安装脚本做这些事（可做到真正“一键”）：

1. 下载并解压对应架构的 tarball 到 `/opt/opencode`
2. 写入 `/opt/opencode/.env`（或提示用户编辑）
3. 安装 `systemd` unit 到 `/etc/systemd/system/opencode.service`
4. `systemctl enable --now opencode`
5. 输出访问地址与下一步（如设置密码、开放端口）

用户侧默认只需要开放一个端口：

- `4096/tcp`（Web + API）

其中：

- Web：`http://<server>:4096`
- API：`http://<server>:4096/api`
- CC Switch 对外不需要单独暴露端口（后端通过 `/api/cc-switch/*` 代理到本机 `8766`）

## 生产环境最小建议

- 强制设置鉴权：`OPENCODE_SERVER_PASSWORD`（否则服务无保护）
- 用 systemd 跑服务（崩溃自动拉起）
- 如需域名/HTTPS：在前面加一层 Nginx/Caddy（反代到 `127.0.0.1:4096`）

## 本仓库当前的“从源码一键启动”

见 `deploy.sh` / `LINUX_DEPLOY.md`：默认会安装 Bun+Rust、构建前端、构建 `cc-switch-server`，然后启动一个端口 `4096` 同时提供 Web + `/api`。

# OpenCode Linux 部署指南

## 系统要求

- Linux 系统 (Ubuntu 20.04+, Debian 11+, CentOS 8+, 或其他主流发行版)
- 至少 4GB RAM
- 至少 10GB 可用磁盘空间
- 需要 sudo 权限进行系统级安装

## 快速安装

### 方式一：一键部署脚本（推荐）

```bash
# 1. 克隆或下载项目到 Linux 服务器
git clone <your-repo-url> opencode
cd opencode

# 2. 赋予脚本执行权限
chmod +x deploy-linux.sh start-services.sh stop-services.sh

# 3. （可选）配置服务端鉴权（强烈推荐对外网开放时配置）
cp .env.example .env
nano .env  # 设置 OPENCODE_SERVER_PASSWORD

# 4. 运行部署脚本（自动安装 Bun + Rust、安装依赖、构建前端、构建 cc-switch-server，并启动服务）
./deploy-linux.sh prod
```

访问 http://localhost:4096 使用 Web 界面（API 前缀为 `/api`）

### 方式二：系统服务方式（开机自启）

```bash
# 1. 将项目移动到系统目录
sudo mkdir -p /opt/opencode
sudo cp -r . /opt/opencode/
sudo chown -R USERNAME:USERNAME /opt/opencode
cd /opt/opencode

# 2. （可选）配置服务端鉴权（强烈推荐对外网开放时配置）
sudo -u USERNAME bash -lc "cd /opt/opencode && cp -n .env.example .env && nano .env"

# 3. 运行部署脚本（首次会安装依赖并构建）
sudo -u USERNAME bash -lc "cd /opt/opencode && chmod +x deploy-linux.sh start-services.sh stop-services.sh && ./deploy-linux.sh prod"

# 4. 安装 systemd 服务
sudo cp systemd/*.service /etc/systemd/system/
sudo mkdir -p /var/log/opencode
sudo systemctl daemon-reload

# 5. 启动服务（将 USERNAME 替换为实际用户名）
sudo systemctl enable opencode-backend@USERNAME
sudo systemctl start opencode-backend@USERNAME

# 6. 查看服务状态
sudo systemctl status opencode-backend@USERNAME
```

## 服务端口

- **Web 界面**: http://localhost:4096
- **后端 API**: http://localhost:4096/api
- **CC-Switch 服务（后端内置代理）**: http://localhost:4096/api/cc-switch/*
- **CC-Switch Server（内部端口，默认不需要对外开放）**: http://127.0.0.1:8766/api

## 管理命令

### 手动启动/停止

```bash
# 启动所有服务
./start-services.sh

# 停止所有服务
./stop-services.sh

# 查看日志
tail -f logs/opencode.log
```

### systemd 服务管理

```bash
# 启动服务
sudo systemctl start opencode-backend@USERNAME

# 停止服务
sudo systemctl stop opencode-backend@USERNAME

# 重启服务
sudo systemctl restart opencode-backend@USERNAME

# 查看日志
sudo journalctl -u opencode-backend@USERNAME -f
sudo tail -f /var/log/opencode/opencode.log
```

## 远程访问配置

默认已监听 `0.0.0.0:4096`。如需修改可使用环境变量：

- `OPENCODE_HOST=0.0.0.0`
- `OPENCODE_PORT=4096`

### 配置防火墙

```bash
# Ubuntu/Debian
sudo ufw allow 4096/tcp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=4096/tcp
sudo firewall-cmd --reload
```

访问地址变为: http://服务器IP:4096

## 生产环境建议

### 安全建议（强烈推荐）

对外网开放时务必设置服务端鉴权：

```bash
export OPENCODE_SERVER_PASSWORD="your-strong-password"
export OPENCODE_SERVER_USERNAME="opencode" # 可选
```

### 使用 Nginx 反向代理（可选）

```bash
# 安装 Nginx
sudo apt install nginx  # Ubuntu/Debian
sudo yum install nginx  # CentOS/RHEL

# 创建配置文件
sudo nano /etc/nginx/sites-available/opencode
```

Nginx 配置示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:4096;
    }
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/opencode /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 配置 HTTPS (可选)

```bash
# 使用 Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 故障排查

### 检查依赖是否安装

```bash
bun --version
cargo --version
rustc --version
```

### 检查端口占用

```bash
sudo netstat -tlnp | grep -E '4096|8766'
```

### 查看详细日志

```bash
# 手动启动模式
cat logs/opencode.log

# systemd 模式
sudo journalctl -u opencode-backend@USERNAME --no-pager
```

### 重新构建

```bash
# 清理并重新构建
cd opencode-dev/packages/opencode
bun install --force
bun run build

cd ../app
bun install --force
bun run build

cd ../../..
cd cc-switch-main/src-tauri
cargo clean
cargo build --release
```

## 卸载

```bash
# 停止服务
sudo systemctl stop opencode-backend@USERNAME

# 禁用自启动
sudo systemctl disable opencode-backend@USERNAME

# 删除服务文件
sudo rm /etc/systemd/system/opencode-backend@.service
sudo systemctl daemon-reload

# 删除项目文件
sudo rm -rf /opt/opencode
sudo rm -rf /var/log/opencode
```

## 技术栈说明

- **前端**: SolidJS + Vite + Tailwind CSS
- **后端**: Bun + Hono + TypeScript
- **Rust 服务**: Tauri + Axum + SQLite
- **包管理**: Bun (前后端), Cargo (Rust)

## 支持

如有问题，请查看日志文件或提交 Issue。

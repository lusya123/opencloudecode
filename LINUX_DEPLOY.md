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

# 3. 运行部署脚本（自动安装依赖并构建）
./deploy-linux.sh

# 4. 启动服务
./start-services.sh
```

访问 http://localhost:5173 使用 Web 界面

### 方式二：系统服务方式（开机自启）

```bash
# 1. 将项目移动到系统目录
sudo mkdir -p /opt/opencode
sudo cp -r . /opt/opencode/
cd /opt/opencode

# 2. 运行部署脚本
sudo chmod +x deploy-linux.sh
sudo ./deploy-linux.sh

# 3. 安装 systemd 服务
sudo cp systemd/*.service /etc/systemd/system/
sudo mkdir -p /var/log/opencode
sudo systemctl daemon-reload

# 4. 启动服务（将 USERNAME 替换为实际用户名）
sudo systemctl enable opencode-backend@USERNAME
sudo systemctl enable opencode-frontend@USERNAME
sudo systemctl enable cc-switch@USERNAME

sudo systemctl start opencode-backend@USERNAME
sudo systemctl start opencode-frontend@USERNAME
sudo systemctl start cc-switch@USERNAME

# 5. 查看服务状态
sudo systemctl status opencode-backend@USERNAME
sudo systemctl status opencode-frontend@USERNAME
sudo systemctl status cc-switch@USERNAME
```

## 服务端口

- **前端 Web 界面**: http://localhost:5173
- **后端 API**: http://localhost:3000
- **CC-Switch 服务**: http://localhost:8080

## 管理命令

### 手动启动/停止

```bash
# 启动所有服务
./start-services.sh

# 停止所有服务
./stop-services.sh

# 查看日志
tail -f logs/backend.log
tail -f logs/frontend.log
tail -f logs/cc-switch.log
```

### systemd 服务管理

```bash
# 启动服务
sudo systemctl start opencode-backend@USERNAME
sudo systemctl start opencode-frontend@USERNAME
sudo systemctl start cc-switch@USERNAME

# 停止服务
sudo systemctl stop opencode-backend@USERNAME
sudo systemctl stop opencode-frontend@USERNAME
sudo systemctl stop cc-switch@USERNAME

# 重启服务
sudo systemctl restart opencode-backend@USERNAME

# 查看日志
sudo journalctl -u opencode-backend@USERNAME -f
sudo tail -f /var/log/opencode/backend.log
```

## 远程访问配置

如果需要从其他机器访问，需要修改绑定地址：

### 修改前端配置

编辑 [opencode-dev/packages/app/vite.config.ts](opencode-dev/packages/app/vite.config.ts)：

```typescript
export default defineConfig({
  server: {
    host: '0.0.0.0',  // 允许外部访问
    port: 5173
  }
})
```

### 配置防火墙

```bash
# Ubuntu/Debian
sudo ufw allow 5173/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 8080/tcp

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=5173/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

访问地址变为: http://服务器IP:5173

## 生产环境建议

### 使用 Nginx 反向代理

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
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
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
sudo netstat -tlnp | grep -E '5173|3000|8080'
```

### 查看详细日志

```bash
# 手动启动模式
cat logs/backend.log
cat logs/frontend.log
cat logs/cc-switch.log

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
sudo systemctl stop opencode-frontend@USERNAME
sudo systemctl stop cc-switch@USERNAME

# 禁用自启动
sudo systemctl disable opencode-backend@USERNAME
sudo systemctl disable opencode-frontend@USERNAME
sudo systemctl disable cc-switch@USERNAME

# 删除服务文件
sudo rm /etc/systemd/system/opencode-*.service
sudo rm /etc/systemd/system/cc-switch@.service
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

#!/bin/bash
set -e

# 默认使用生产模式，可通过参数切换：./deploy.sh dev
MODE=${1:-prod}

echo "=== OpenCode 一键部署脚本 (模式: $MODE) ==="

# 检查并安装 Bun
if ! command -v bun &> /dev/null; then
    echo "安装 Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# 检查并安装 Rust
if ! command -v cargo &> /dev/null; then
    echo "安装 Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# 确保环境变量生效
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"

mkdir -p logs

echo "安装依赖并构建..."

cd opencode-dev
bun install
cd packages/opencode
bun run build
cd ../../../

echo "启动服务..."

# 启动后端（支持 dev/prod 模式，会自动启动 cc-switch）
cd opencode-dev/packages/opencode
nohup bun run --conditions=browser src/index.ts serve --mode $MODE --port 4096 > ../../../logs/backend.log 2>&1 &
echo $! > ../../../logs/backend.pid
cd ../../..

sleep 3

# 启动前端
cd opencode-dev/packages/app
nohup bun run dev > ../../../logs/frontend.log 2>&1 &
echo $! > ../../../logs/frontend.pid
cd ../../..

echo ""
echo "=== 部署完成 ==="
echo "访问: http://localhost:5173"
echo "后端: http://localhost:4096"
echo "CC-Switch: http://localhost:8766 (自动启动)"
echo ""
echo "日志: logs/"
echo "停止: ./stop-services.sh"

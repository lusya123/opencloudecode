#!/bin/bash

# 启动所有服务
echo "=== 启动 OpenCode 服务 ==="

# 创建日志目录
mkdir -p logs

# 启动 opencode 后端
echo "启动 opencode 后端服务 (端口 3000)..."
cd opencode-dev/packages/opencode
bun run dev > ../../../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../../../logs/backend.pid
cd ../../..

# 等待后端启动
sleep 3

# 启动 opencode 前端
echo "启动 opencode 前端服务 (端口 5173)..."
cd opencode-dev/packages/app
bun run dev > ../../../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../../../logs/frontend.pid
cd ../../..

# 启动 cc-switch Rust 服务
echo "启动 cc-switch 服务 (端口 8080)..."
./cc-switch-main/src-tauri/target/release/cc-switch-server > logs/cc-switch.log 2>&1 &
CC_SWITCH_PID=$!
echo $CC_SWITCH_PID > logs/cc-switch.pid

echo ""
echo "=== 所有服务已启动 ==="
echo "后端服务: http://localhost:3000 (PID: $BACKEND_PID)"
echo "前端服务: http://localhost:5173 (PID: $FRONTEND_PID)"
echo "CC-Switch: http://localhost:8080 (PID: $CC_SWITCH_PID)"
echo ""
echo "日志文件位于 logs/ 目录"
echo "停止服务: ./stop-services.sh"

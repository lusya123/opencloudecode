#!/bin/bash

echo "=== 停止 OpenCode 服务 ==="

if [ -f logs/backend.pid ]; then
    BACKEND_PID=$(cat logs/backend.pid)
    kill $BACKEND_PID 2>/dev/null && echo "后端服务已停止 (PID: $BACKEND_PID)"
    rm logs/backend.pid
fi

if [ -f logs/frontend.pid ]; then
    FRONTEND_PID=$(cat logs/frontend.pid)
    kill $FRONTEND_PID 2>/dev/null && echo "前端服务已停止 (PID: $FRONTEND_PID)"
    rm logs/frontend.pid
fi

echo "所有服务已停止"

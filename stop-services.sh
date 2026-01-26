#!/bin/bash

echo "=== 停止 OpenCode 服务 ==="

if [ -f logs/opencode.pid ]; then
    PID=$(cat logs/opencode.pid)
    kill "$PID" 2>/dev/null && echo "OpenCode 服务已停止 (PID: $PID)"
    rm logs/opencode.pid
fi

echo "所有服务已停止"

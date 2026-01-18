#!/bin/bash
set -e

echo "=== OpenCode Linux 部署脚本 ==="

# 检查依赖
check_dependencies() {
    echo "检查系统依赖..."

    if ! command -v curl &> /dev/null; then
        echo "错误: 需要安装 curl"
        exit 1
    fi

    if ! command -v git &> /dev/null; then
        echo "错误: 需要安装 git"
        exit 1
    fi
}

# 安装 Bun
install_bun() {
    if ! command -v bun &> /dev/null; then
        echo "安装 Bun..."
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
    else
        echo "Bun 已安装: $(bun --version)"
    fi
}

# 安装 Rust
install_rust() {
    if ! command -v cargo &> /dev/null; then
        echo "安装 Rust..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
        source "$HOME/.cargo/env"
    else
        echo "Rust 已安装: $(rustc --version)"
    fi
}

# 构建 opencode-dev 后端
build_opencode_backend() {
    echo "构建 opencode-dev 后端..."
    cd opencode-dev/packages/opencode
    bun install
    bun run build
    cd ../../..
}

# 构建 opencode-dev 前端
build_opencode_frontend() {
    echo "构建 opencode-dev 前端..."
    cd opencode-dev/packages/app
    bun install
    bun run build
    cd ../../..
}

# 构建 cc-switch Rust 服务
build_cc_switch() {
    echo "构建 cc-switch 服务..."
    cd cc-switch-main/src-tauri
    cargo build --release
    cd ../..
}

# 主流程
main() {
    check_dependencies
    install_bun
    install_rust

    echo ""
    echo "开始构建项目..."
    build_opencode_backend
    build_opencode_frontend
    build_cc_switch

    echo ""
    echo "=== 构建完成 ==="
    echo "请运行 ./start-services.sh 启动服务"
}

main

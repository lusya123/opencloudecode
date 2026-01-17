# CC Switch 服务集成需求文档

**版本**: v1.0
**日期**: 2026-01-17
**状态**: 草稿

---

## 1. 项目背景

### 1.1 现状描述

当前系统由以下组件构成：

1. **OpenCodePro** - Web 前端应用，基于 SolidJS
2. **OpenCode-dev** - 后端服务，基于 Bun + TypeScript + Hono
3. **CC Switch** - 桌面端应用，基于 Tauri (Rust 后端 + React 前端)

现有启动方式：

```bash
# 终端 1：启动后端
cd opencode-dev/packages/opencode
bun run --conditions=browser src/index.ts serve --port 4096

# 终端 2：启动前端
cd opencode-pro
bun run dev
```

### 1.2 问题描述

根据之前的需求文档（CC-Switch-Web-Integration-PRD.md），我们已经完成了 CC Switch 的前端界面集成到 OpenCodePro 中。但是，目前存在以下问题：

**CC Switch 后端服务没有启动**，导致前端界面无法正常工作。

原因：CC Switch 目前是 Tauri 桌面应用，只能以 GUI 模式运行，没有独立的 HTTP API 服务器模式。

### 1.3 需求目标

1. 为 CC Switch 添加独立的 HTTP API 服务器模式
2. 实现 CC Switch 服务与 OpenCode-dev 的集成启动
3. 保持现有启动方式简单（用户仍然只需要两条命令）

---

## 2. 术语说明

### 2.1 CC Switch HTTP API Server 是什么？

**它是一个配置管理服务**，向外提供 REST API，用于管理和修改 Claude Code 的配置。

```
┌────────────────────────────────────────────────────────────┐
│  CC Switch HTTP API Server 的职责：                          │
│                                                            │
│  ✅ 提供 REST API 来管理提供商配置                            │
│     - 获取提供商列表                                         │
│     - 添加/编辑/删除提供商                                    │
│     - 切换当前使用的提供商                                    │
│                                                            │
│  ✅ 读写 Claude Code 的配置文件                               │
│     - 读取 ~/.claude/settings.json                         │
│     - 写入新的 API Key、Base URL 等配置                      │
│                                                            │
│  ❌ 不负责中转大模型 API 请求                                  │
│     （那是代理模式的功能，本期不实现）                          │
└────────────────────────────────────────────────────────────┘
```

### 2.2 工作流程示例

当用户在 OpenCodePro 前端点击「切换到 PackyCode」时：

```
前端 (OpenCodePro)
    │
    │  POST /api/providers/123/switch
    ↓
CC Switch HTTP Server (Rust)
    │
    │  1. 从 SQLite 读取 PackyCode 的配置
    │  2. 把 API Key 和 Base URL 写入 ~/.claude/settings.json
    │  3. 返回成功
    ↓
前端显示「切换成功」
```

之后，当 Claude Code CLI 运行时，它会直接读取 `~/.claude/settings.json` 中的配置，向 PackyCode 的 API 发请求。**请求不经过 CC Switch**。

---

## 3. 功能需求

### 3.1 CC Switch 后端改造

为 CC Switch 添加独立 HTTP 服务器模式，使其可以在不启动 Tauri GUI 的情况下运行。

#### 3.1.1 双模式运行

| 模式 | 启动方式 | 说明 |
|------|----------|------|
| GUI 模式 | `./cc-switch` (原有) | 启动 Tauri 桌面应用 |
| Server 模式 | `./cc-switch-server --port 8766` (新增) | 仅启动 HTTP API 服务 |

#### 3.1.2 HTTP API 端点

复用原有需求文档中定义的 API：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/providers | 获取提供商列表 |
| GET | /api/providers/current | 获取当前提供商 |
| POST | /api/providers | 添加提供商 |
| PUT | /api/providers/:id | 更新提供商 |
| DELETE | /api/providers/:id | 删除提供商 |
| POST | /api/providers/:id/switch | 切换提供商 |

### 3.2 OpenCode-dev 集成

在 OpenCode-dev 启动时自动拉起 CC Switch HTTP 服务。

#### 3.2.1 集成方式选项

**方案 A：子进程方式（推荐）**

OpenCode-dev 在启动时 spawn CC Switch 作为子进程：

```
OpenCode-dev 主进程
    │
    ├── 启动 HTTP 服务 (端口 4096)
    │
    └── spawn 子进程
            └── CC Switch HTTP Server (端口 8766)
```

优点：
- 用户启动命令不变
- CC Switch 随 OpenCode-dev 一起启动和关闭
- 进程管理简单

**方案 B：API 代理方式**

OpenCode-dev 代理 `/cc-switch/*` 请求到 CC Switch 服务：

```
前端请求 → OpenCode-dev (/cc-switch/*) → CC Switch (127.0.0.1:8766)
```

优点：
- 前端只需访问一个端口
- 可以统一处理认证和日志

**推荐组合使用方案 A + B**

#### 3.2.2 配置项

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| CC_SWITCH_ENABLED | true | 是否启用 CC Switch 服务 |
| CC_SWITCH_SERVER_PATH | cc-switch-server | CC Switch 可执行文件路径 |
| CC_SWITCH_PORT | 8766 | CC Switch 服务端口 |

---

## 4. 技术方案

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenCodePro (前端)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  侧边栏: "Claude 切换" 标签                            │   │
│  │  - 提供商列表展示                                       │   │
│  │  - 添加/编辑/删除提供商                                 │   │
│  │  - 一键切换当前提供商                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓ HTTP                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    OpenCode-dev (后端主进程)                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Hono HTTP 服务器 (端口 4096)                          │   │
│  │  ├── /session, /provider, /config ...  (现有路由)     │   │
│  │  └── /cc-switch/*  (代理到 CC Switch)                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          │ spawn 子进程                      │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  CC Switch HTTP Server (子进程, 端口 8766)             │   │
│  │  ├── REST API 路由 (Axum)                             │   │
│  │  ├── ProviderService (业务逻辑)                       │   │
│  │  ├── Database (SQLite)                               │   │
│  │  └── 配置文件读写                                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              ~/.claude/settings.json (配置文件)              │
│              ~/.cc-switch/cc-switch.db (数据库)              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 CC Switch 后端改造

#### 4.2.1 改造原则

1. **完全复用现有代码**：保留所有 `services/`、`database/`、`config.rs` 中的代码
2. **新增独立入口**：创建新的 bin target，不修改原有 Tauri 应用
3. **双模式共存**：GUI 模式和 Server 模式可以独立运行

#### 4.2.2 需要新增的文件

| 文件 | 说明 |
|------|------|
| `src/bin/cc-switch-server.rs` | 独立 HTTP 服务器入口 |
| `src/api/mod.rs` | API 模块入口 |
| `src/api/server.rs` | HTTP 服务器实现 |
| `src/api/handlers.rs` | API 请求处理函数 |
| `src/api/types.rs` | API 请求/响应数据结构 |

#### 4.2.3 需要修改的文件

| 文件 | 修改内容 |
|------|----------|
| `Cargo.toml` | 添加新的 [[bin]] target |

#### 4.2.4 完全不修改的文件（100% 复用）

- `src/services/provider/mod.rs` - 提供商业务逻辑
- `src/services/config/mod.rs` - 配置文件操作
- `src/database/` - 所有数据库操作
- `src/config.rs` - Claude 配置路径识别
- `src/lib.rs` - 原有 Tauri 应用
- `src/main.rs` - 原有 Tauri 应用入口

### 4.3 OpenCode-dev 集成改造

#### 4.3.1 子进程管理

在 `serve.ts` 中添加子进程启动逻辑：

```typescript
// opencode-dev/packages/opencode/src/cli/cmd/serve.ts

import { spawn, ChildProcess } from 'child_process'

let ccSwitchProcess: ChildProcess | null = null

function startCCSwitchServer(): ChildProcess | null {
  const enabled = process.env.CC_SWITCH_ENABLED !== 'false'
  if (!enabled) {
    console.log('[CC Switch] Disabled via CC_SWITCH_ENABLED=false')
    return null
  }

  const serverPath = process.env.CC_SWITCH_SERVER_PATH || 'cc-switch-server'
  const port = process.env.CC_SWITCH_PORT || '8766'

  console.log(`[CC Switch] Starting server on port ${port}...`)

  const child = spawn(serverPath, ['--port', port], {
    stdio: 'inherit',
    detached: false
  })

  child.on('error', (err) => {
    console.error(`[CC Switch] Failed to start: ${err.message}`)
  })

  child.on('exit', (code) => {
    console.log(`[CC Switch] Server exited with code ${code}`)
  })

  return child
}

function stopCCSwitchServer() {
  if (ccSwitchProcess) {
    ccSwitchProcess.kill()
    ccSwitchProcess = null
  }
}

// 在 serve 命令启动时调用
ccSwitchProcess = startCCSwitchServer()

// 在进程退出时清理（确保子进程先关闭）
process.on('SIGINT', async () => {
  console.log('[OpenCode-dev] Received SIGINT, shutting down...')
  await gracefulShutdown()
})

process.on('SIGTERM', async () => {
  console.log('[OpenCode-dev] Received SIGTERM, shutting down...')
  await gracefulShutdown()
})

async function gracefulShutdown() {
  // 1. 先关闭 CC Switch 子进程
  if (ccSwitchProcess) {
    console.log('[CC Switch] Stopping server...')
    ccSwitchProcess.kill('SIGTERM')

    // 等待子进程退出，最多等待 5 秒
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[CC Switch] Force killing server...')
        ccSwitchProcess?.kill('SIGKILL')
        resolve()
      }, 5000)

      ccSwitchProcess?.on('exit', () => {
        clearTimeout(timeout)
        console.log('[CC Switch] Server stopped')
        resolve()
      })
    })

    ccSwitchProcess = null
  }

  // 2. 子进程关闭后，主进程才退出
  console.log('[OpenCode-dev] Shutdown complete')
  process.exit(0)
}
```

#### 4.3.2 API 代理路由

在 `server.ts` 中添加代理路由：

```typescript
// opencode-dev/packages/opencode/src/server/server.ts

app.all('/cc-switch/*', async (c) => {
  const ccSwitchPort = process.env.CC_SWITCH_PORT || '8766'
  const targetPath = c.req.path.replace('/cc-switch', '/api')
  const targetUrl = `http://127.0.0.1:${ccSwitchPort}${targetPath}`

  try {
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== 'GET' ? await c.req.raw.text() : undefined
    })

    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    })
  } catch (error) {
    return c.json({
      success: false,
      error: 'CC Switch service unavailable'
    }, 503)
  }
})
```

---

## 5. 实施计划

### 5.1 阶段一：CC Switch 后端改造

**目标**：为 CC Switch 添加独立 HTTP 服务器模式

**任务清单**：

1. 在 `Cargo.toml` 中添加新的 [[bin]] target
2. 创建 `src/api/` 模块
3. 实现 HTTP 服务器和 API handlers
4. 编译测试独立运行

### 5.2 阶段二：OpenCode-dev 集成

**目标**：实现 CC Switch 服务的自动启动和代理

**任务清单**：

1. 修改 `serve.ts`，添加子进程管理逻辑
2. 修改 `server.ts`，添加 API 代理路由
3. 添加配置项支持
4. 集成测试

### 5.3 阶段三：部署与文档

**目标**：完成部署配置和文档

**任务清单**：

1. 编译 CC Switch Server 可执行文件
2. 配置可执行文件路径
3. 更新部署文档
4. 更新用户使用指南

---

## 6. 部署方案

### 6.1 CC Switch Server 编译

```bash
cd cc-switch-main/src-tauri
cargo build --release --bin cc-switch-server
```

编译产物：`target/release/cc-switch-server`

### 6.2 部署目录结构

```
/opt/opencode/
├── opencode-dev/          # OpenCode-dev 项目
├── opencode-pro/          # OpenCodePro 项目
└── bin/
    └── cc-switch-server   # CC Switch 可执行文件
```

### 6.3 启动配置

```bash
# 设置环境变量
export CC_SWITCH_SERVER_PATH=/opt/opencode/bin/cc-switch-server
export CC_SWITCH_PORT=8766

# 启动后端（会自动启动 CC Switch）
cd opencode-dev/packages/opencode
bun run --conditions=browser src/index.ts serve --port 4096

# 启动前端
cd opencode-pro
bun run dev
```

### 6.4 验证服务

```bash
# 检查 CC Switch 服务是否运行
curl http://127.0.0.1:8766/api/providers

# 通过 OpenCode-dev 代理访问
curl http://127.0.0.1:4096/cc-switch/providers
```

---

## 7. 风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| CC Switch 可执行文件不存在 | 服务无法启动 | 启动时检查文件存在，给出明确错误提示 |
| 端口冲突 | 服务启动失败 | 支持配置端口，检测端口占用 |
| 子进程意外退出 | 功能不可用 | 监控子进程状态，支持自动重启 |
| 跨平台兼容性 | 部分系统无法运行 | 提供多平台编译版本 |

---

## 8. 附录

### 8.1 相关文档

- [CC-Switch-Web-Integration-PRD.md](./CC-Switch-Web-Integration-PRD.md) - 前端集成需求文档

### 8.2 相关文件路径

**CC Switch 项目**：
- 后端代码：`cc-switch-main/src-tauri/src/`
- 现有 Axum 代码：`cc-switch-main/src-tauri/src/proxy/server.rs`

**OpenCode-dev 项目**：
- 服务器代码：`opencode-dev/packages/opencode/src/server/server.ts`
- 启动命令：`opencode-dev/packages/opencode/src/cli/cmd/serve.ts`

---

**文档变更记录**：

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.0 | 2026-01-17 | Claude | 初稿 |

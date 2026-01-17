# CC Switch Web 集成需求文档

**版本**: v1.0
**日期**: 2026-01-17
**状态**: 草稿

---

## 1. 项目背景

### 1.1 现状描述

当前存在三个相关项目：

1. **OpenCodePro** - Web 前端应用，基于 SolidJS 构建，提供 AI 编程助手界面
2. **OpenCode-dev** - 后端服务，基于 Bun + TypeScript，提供 AI 编程能力的 API
3. **CC Switch** - 桌面端应用，基于 Tauri (Rust + React)，用于管理和切换 Claude Code 的 API 提供商配置

OpenCodePro 与 OpenCode-dev 已形成完整的前后端分离架构。CC Switch 作为独立的桌面应用，具备以下核心能力：

- 识别不同操作系统（Linux/macOS/Windows）的 Claude Code 配置文件路径
- 管理多个 API 提供商配置（API Base URL、API Key、模型等）
- 一键切换当前使用的提供商
- SQLite 数据库存储提供商信息

### 1.2 需求来源

用户在 Linux 服务器上使用 Claude Code 时，需要切换不同的 API 提供商。由于 CC Switch 是桌面应用，无法在无 GUI 的 Linux 服务器上运行。因此需要将 CC Switch 功能 Web 化，集成到 OpenCodePro 中，使用户能够通过 Web 界面完成提供商切换操作。

### 1.3 项目目标

将 CC Switch 的核心功能改造为 Web 服务，并集成到 OpenCodePro 前端，实现：

1. 在 Linux 环境下通过 Web 界面管理 Claude Code 提供商配置
2. 最大程度复用 CC Switch 现有后端逻辑
3. 最小化代码改动量

---

## 2. 需求概述

### 2.1 功能范围

**本期实现（最小化版本）**：

| 功能 | 描述 |
|------|------|
| 提供商列表展示 | 展示所有已配置的 Claude Code API 提供商 |
| 添加提供商 | 新增提供商配置（名称、API Base URL、API Key） |
| 编辑提供商 | 修改现有提供商配置 |
| 删除提供商 | 删除指定提供商配置 |
| 切换提供商 | 一键切换当前使用的提供商 |
| 当前状态显示 | 显示当前正在使用的提供商 |

**暂不实现**：

- MCP 服务器管理
- 代理模式（Proxy Takeover）
- Codex 和 Gemini 支持
- 通用提供商（Universal Provider）
- 技能管理（Skills）
- 提示词管理（Prompts）

### 2.2 用户故事

1. **作为用户**，我希望在 OpenCodePro 侧边栏看到一个「Claude 切换」按钮，点击后可以管理我的 Claude Code 提供商配置

2. **作为用户**，我希望能够添加新的提供商，填写名称、API Base URL 和 API Key

3. **作为用户**，我希望能够一键切换到不同的提供商，切换后 Claude Code 立即使用新的配置

4. **作为用户**，我希望能够清楚地看到当前正在使用哪个提供商

5. **作为用户**，我希望能够编辑或删除已有的提供商配置

---

## 3. 功能需求

### 3.1 提供商管理

#### 3.1.1 提供商数据模型

```typescript
interface Provider {
  id: string;              // 唯一标识符 (UUID)
  name: string;            // 提供商名称（如：PackyCode、AIGoCode）
  base_url: string;        // API Base URL
  api_key: string;         // API Key（加密存储）
  model?: string;          // 默认模型（可选）
  is_current: boolean;     // 是否为当前使用的提供商
  created_at: string;      // 创建时间
  updated_at: string;      // 更新时间
}
```

#### 3.1.2 添加提供商

**输入字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 提供商名称，用于显示和识别 |
| base_url | string | 是 | API Base URL，如 `https://api.anthropic.com` |
| api_key | string | 是 | API Key，用于认证 |
| model | string | 否 | 默认模型名称 |

**业务规则**：

- 名称不能重复
- Base URL 必须是有效的 URL 格式
- API Key 不能为空
- 新增的第一个提供商自动设为当前提供商

#### 3.1.3 编辑提供商

- 支持修改所有字段
- 如果修改的是当前提供商，修改后自动同步到 Claude Code 配置文件

#### 3.1.4 删除提供商

- 不能删除当前正在使用的提供商（需先切换到其他提供商）
- 删除前需要用户确认

### 3.2 切换功能

#### 3.2.1 切换流程

```
用户点击切换按钮
       ↓
调用后端 API
       ↓
后端执行切换逻辑（复用 CC Switch 现有逻辑）：
  1. 备份当前配置
  2. 更新数据库中的 is_current 标记
  3. 写入新配置到 ~/.claude/settings.json
  4. 验证配置文件写入成功
       ↓
返回切换结果
       ↓
前端更新 UI 显示
```

#### 3.2.2 配置文件修改

切换时需要修改的配置文件字段（`~/.claude/settings.json`）：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<api_key>",
    "ANTHROPIC_BASE_URL": "<base_url>",
    "ANTHROPIC_MODEL": "<model>"
  }
}
```

#### 3.2.3 跨平台路径识别

复用 CC Switch 现有的路径识别逻辑：

| 操作系统 | 配置文件路径 |
|----------|-------------|
| macOS | `~/.claude/settings.json` |
| Linux | `~/.claude/settings.json` |
| Windows | `%USERPROFILE%\.claude\settings.json` |

### 3.3 UI 集成

#### 3.3.1 入口位置

在 OpenCodePro 侧边栏添加第 5 个标签按钮：

```
┌─────────────────────────────┐
│  [Workspace] [文件] [任务] [终端] [Claude切换]  │  ← 新增
├─────────────────────────────┤
│                             │
│     (标签内容区域)           │
│                             │
└─────────────────────────────┘
```

#### 3.3.2 界面布局

```
┌─────────────────────────────────────┐
│  Claude Code 提供商管理              │
├─────────────────────────────────────┤
│  当前: ✅ PackyCode                  │  ← 当前提供商状态
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │ 📦 PackyCode          [切换] │    │  ← 提供商卡片
│  │    https://api.packy.ai     │    │
│  │    [编辑] [删除]             │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 📦 AIGoCode           [切换] │    │
│  │    https://api.aigo.ai      │    │
│  │    [编辑] [删除]             │    │
│  └─────────────────────────────┘    │
│                                     │
│  [+ 添加提供商]                      │  ← 添加按钮
└─────────────────────────────────────┘
```

#### 3.3.3 添加/编辑对话框

```
┌─────────────────────────────────────┐
│  添加提供商                    [✕]  │
├─────────────────────────────────────┤
│  名称:                              │
│  ┌─────────────────────────────┐    │
│  │ PackyCode                   │    │
│  └─────────────────────────────┘    │
│                                     │
│  API Base URL:                      │
│  ┌─────────────────────────────┐    │
│  │ https://api.packy.ai        │    │
│  └─────────────────────────────┘    │
│                                     │
│  API Key:                           │
│  ┌─────────────────────────────┐    │
│  │ sk-xxxx...                  │    │
│  └─────────────────────────────┘    │
│                                     │
│  模型 (可选):                        │
│  ┌─────────────────────────────┐    │
│  │ claude-sonnet-4-20250514    │    │
│  └─────────────────────────────┘    │
│                                     │
│        [取消]  [保存]               │
└─────────────────────────────────────┘
```

---

## 4. 技术方案

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenCodePro (前端)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  侧边栏第5个标签: "Claude 切换"                         │   │
│  │  - 提供商列表展示                                       │   │
│  │  - 添加/编辑/删除提供商                                 │   │
│  │  - 一键切换当前提供商                                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓ HTTP API                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              CC Switch HTTP API Server (后端)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  REST API 路由 (基于 Axum):                            │   │
│  │  GET    /api/providers          获取提供商列表         │   │
│  │  GET    /api/providers/current  获取当前提供商         │   │
│  │  POST   /api/providers          添加提供商             │   │
│  │  PUT    /api/providers/:id      更新提供商             │   │
│  │  DELETE /api/providers/:id      删除提供商             │   │
│  │  POST   /api/providers/:id/switch 切换提供商           │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  复用 CC Switch 现有后端逻辑:                           │   │
│  │  - ProviderService (增删改查切换)                      │   │
│  │  - ConfigService (配置文件读写)                        │   │
│  │  - Database (SQLite 存储)                             │   │
│  │  - 跨平台路径识别逻辑                                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              ~/.claude/settings.json (配置文件)              │
│              ~/.cc-switch/cc-switch.db (数据库)              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 后端改造

#### 4.2.1 改造原则

1. **最大程度复用**：保留所有 `services/`、`database/`、`config.rs` 中的代码
2. **最小改动**：仅将 Tauri Commands 转换为 HTTP Endpoints
3. **独立运行**：编译为独立可执行文件，不依赖 Tauri 运行时

#### 4.2.2 需要新增的文件

| 文件 | 说明 | 预估代码量 |
|------|------|------------|
| `src/api_server.rs` | HTTP 服务器主入口 | ~150 行 |
| `src/api_handlers.rs` | API 请求处理函数 | ~300 行 |
| `src/api_types.rs` | API 请求/响应数据结构 | ~100 行 |

#### 4.2.3 需要修改的文件

| 文件 | 修改内容 | 预估改动 |
|------|----------|----------|
| `src/main.rs` | 添加 HTTP 服务器启动逻辑 | ~50 行 |
| `Cargo.toml` | 添加编译 feature flag | ~10 行 |

#### 4.2.4 保持不变的文件

- `src/services/provider/mod.rs` - 提供商业务逻辑
- `src/services/config/mod.rs` - 配置文件操作
- `src/database/` - 所有数据库操作
- `src/config.rs` - Claude 配置路径识别

### 4.3 前端集成

#### 4.3.1 需要新增的文件

| 文件路径 | 说明 |
|----------|------|
| `packages/app/src/components/claude-switch-tab.tsx` | 主界面组件 |
| `packages/app/src/components/provider-card.tsx` | 提供商卡片组件 |
| `packages/app/src/components/add-provider-dialog.tsx` | 添加/编辑对话框 |
| `packages/sdk/src/cc-switch-api.ts` | API 调用客户端 |

#### 4.3.2 需要修改的文件

| 文件路径 | 修改内容 |
|----------|----------|
| `packages/app/src/pages/layout.tsx` | 添加第5个侧边栏标签按钮 |
| `packages/app/src/context/scheduler.tsx` | 添加 `"claude-switch"` 视图类型 |

#### 4.3.3 前端技术栈

- 框架：SolidJS
- 组件库：@kobalte/core（复用现有组件风格）
- HTTP 客户端：fetch API
- 状态管理：SolidJS Store

---

## 5. 接口设计

### 5.1 HTTP API 规范

#### 5.1.1 基础信息

- **Base URL**: `http://127.0.0.1:8766/api`
- **Content-Type**: `application/json`
- **认证方式**: 暂无（本地服务）

#### 5.1.2 获取提供商列表

**请求**：
```http
GET /api/providers?app=claude
```

**响应**：
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "name": "PackyCode",
      "base_url": "https://api.packy.ai",
      "api_key": "sk-xxxx...",
      "model": "claude-sonnet-4-20250514",
      "is_current": true,
      "created_at": "2026-01-17T10:00:00Z",
      "updated_at": "2026-01-17T10:00:00Z"
    }
  ]
}
```

#### 5.1.3 获取当前提供商

**请求**：
```http
GET /api/providers/current?app=claude
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid-1",
    "name": "PackyCode",
    "base_url": "https://api.packy.ai",
    "is_current": true
  }
}
```

#### 5.1.4 添加提供商

**请求**：
```http
POST /api/providers
Content-Type: application/json

{
  "app": "claude",
  "name": "PackyCode",
  "base_url": "https://api.packy.ai",
  "api_key": "sk-xxxx",
  "model": "claude-sonnet-4-20250514"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid-new",
    "name": "PackyCode",
    "base_url": "https://api.packy.ai",
    "is_current": false
  }
}
```

#### 5.1.5 更新提供商

**请求**：
```http
PUT /api/providers/:id
Content-Type: application/json

{
  "app": "claude",
  "name": "PackyCode Updated",
  "base_url": "https://api.packy.ai/v2",
  "api_key": "sk-yyyy",
  "model": "claude-opus-4-20250514"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "uuid-1",
    "name": "PackyCode Updated"
  }
}
```

#### 5.1.6 删除提供商

**请求**：
```http
DELETE /api/providers/:id?app=claude
```

**响应**：
```json
{
  "success": true,
  "message": "Provider deleted successfully"
}
```

**错误响应**（删除当前提供商时）：
```json
{
  "success": false,
  "error": "Cannot delete the current provider. Please switch to another provider first."
}
```

#### 5.1.7 切换提供商

**请求**：
```http
POST /api/providers/:id/switch
Content-Type: application/json

{
  "app": "claude"
}
```

**响应**：
```json
{
  "success": true,
  "message": "Switched to PackyCode successfully",
  "data": {
    "id": "uuid-1",
    "name": "PackyCode",
    "is_current": true
  }
}
```

### 5.2 错误码定义

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| PROVIDER_NOT_FOUND | 404 | 提供商不存在 |
| PROVIDER_NAME_EXISTS | 400 | 提供商名称已存在 |
| CANNOT_DELETE_CURRENT | 400 | 不能删除当前提供商 |
| INVALID_URL | 400 | URL 格式无效 |
| CONFIG_WRITE_FAILED | 500 | 配置文件写入失败 |
| DATABASE_ERROR | 500 | 数据库操作失败 |

---

## 6. 实施计划

### 6.1 阶段划分

#### 第一阶段：后端 HTTP API 化

**目标**：将 CC Switch 后端改造为 HTTP API 服务

**任务清单**：

1. 创建 `api_server.rs`，基于 Axum 构建 HTTP 服务器
2. 创建 `api_handlers.rs`，实现 6 个 API 端点
3. 创建 `api_types.rs`，定义请求/响应数据结构
4. 修改 `main.rs`，支持 HTTP 服务器模式启动
5. 修改 `Cargo.toml`，添加编译 feature flag
6. 编写 API 测试用例
7. 编译为独立可执行文件

#### 第二阶段：前端组件开发

**目标**：在 OpenCodePro 中实现 Claude 切换界面

**任务清单**：

1. 创建 `cc-switch-api.ts`，封装 API 调用
2. 创建 `claude-switch-tab.tsx`，实现主界面
3. 创建 `provider-card.tsx`，实现提供商卡片
4. 创建 `add-provider-dialog.tsx`，实现添加/编辑对话框
5. 修改 `scheduler.tsx`，添加新的视图类型
6. 修改 `layout.tsx`，添加侧边栏按钮
7. 编写前端单元测试

#### 第三阶段：集成测试与部署

**目标**：完成端到端测试，准备部署

**任务清单**：

1. 在 macOS 环境测试完整流程
2. 在 Linux 环境测试完整流程
3. 编写部署文档
4. 创建 Docker 镜像（可选）
5. 编写用户使用指南

### 6.2 里程碑

| 里程碑 | 阶段 | 交付物 |
|--------|------|--------|
| M1 | 第一阶段完成 | CC Switch HTTP API 服务可独立运行 |
| M2 | 第二阶段完成 | OpenCodePro 前端集成完成 |
| M3 | 第三阶段完成 | 全平台测试通过，可发布 |

---

## 7. 测试计划

### 7.1 单元测试

**后端测试**：

- [ ] 提供商 CRUD 操作
- [ ] 切换逻辑
- [ ] 配置文件读写
- [ ] 跨平台路径识别

**前端测试**：

- [ ] API 调用封装
- [ ] 组件渲染
- [ ] 用户交互

### 7.2 集成测试

- [ ] 添加提供商 → 验证数据库和配置文件
- [ ] 切换提供商 → 验证配置文件更新
- [ ] 删除提供商 → 验证数据清理
- [ ] 并发操作 → 验证数据一致性

### 7.3 环境测试

- [ ] macOS 环境测试
- [ ] Linux (Ubuntu) 环境测试
- [ ] Linux (CentOS) 环境测试

---

## 8. 部署方案

### 8.1 后端部署

**运行方式**：

```bash
# 启动 CC Switch HTTP API 服务
./cc-switch-server --port 8766

# 或使用环境变量
CC_SWITCH_PORT=8766 ./cc-switch-server
```

**配置项**：

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| CC_SWITCH_PORT | 8766 | HTTP 服务监听端口 |
| CC_SWITCH_HOST | 127.0.0.1 | HTTP 服务监听地址 |

### 8.2 前端配置

在 OpenCodePro 配置文件中添加：

```json
{
  "ccSwitch": {
    "apiUrl": "http://127.0.0.1:8766"
  }
}
```

### 8.3 推荐部署架构

```
┌─────────────────────────────────────┐
│           Linux 服务器              │
│  ┌─────────────────────────────┐   │
│  │  CC Switch HTTP Server      │   │
│  │  (127.0.0.1:8766)           │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │  OpenCode-dev Server        │   │
│  │  (0.0.0.0:3000)             │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │  Claude Code CLI            │   │
│  │  (使用 ~/.claude/settings)   │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
            ↑
            │ HTTP
            ↓
┌─────────────────────────────────────┐
│         用户浏览器                   │
│  ┌─────────────────────────────┐   │
│  │  OpenCodePro (前端)         │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

---

## 9. 风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 配置文件写入权限不足 | 切换失败 | 启动时检查权限，提示用户 |
| API Key 泄露 | 安全风险 | 仅监听 localhost，传输加密 |
| 并发切换导致配置冲突 | 配置损坏 | 使用文件锁，原子写入 |
| 数据库损坏 | 数据丢失 | 定期备份，启动时校验 |

---

## 10. 附录

### 10.1 相关文件路径

**CC Switch 项目**：
- 后端代码：`cc-switch-main/src-tauri/src/`
- 前端代码：`cc-switch-main/src/`

**OpenCodePro 项目**：
- 前端代码：`opencode-pro/packages/app/src/`
- SDK 代码：`opencode-pro/packages/sdk/src/`

**OpenCode-dev 项目**：
- 后端代码：`opencode-dev/packages/opencode/src/`

### 10.2 参考资料

- CC Switch GitHub 仓库
- OpenCode 官方文档
- Axum 框架文档
- SolidJS 官方文档

---

**文档变更记录**：

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| v1.0 | 2026-01-17 | Claude | 初稿 |

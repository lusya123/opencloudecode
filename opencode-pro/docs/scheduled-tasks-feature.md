# 定时任务功能需求文档

## 1. 功能概述

在 OpenCode Pro Web 界面的侧边栏顶部添加导航切换功能，允许用户在「Workspace（工作区）」和「定时任务」两个视图之间切换。定时任务功能允许用户设置自动执行的任务，这些任务可以像人类对话一样调用完整的 Agent 能力。

## 2. UI 设计

### 2.1 侧边栏导航按钮

**位置**：侧边栏顶部，Logo 下方

**布局**：两个按钮**横向排布**

```
┌─────────────────────────────────┐
│  [OpenCode Logo]                │
├─────────────────────────────────┤
│  [📁 Workspace] [⏰ 定时任务]    │  ← 横向排布的两个切换按钮
├─────────────────────────────────┤
│                                 │
│  (根据选中的按钮显示不同内容)      │
│                                 │
└─────────────────────────────────┘
```

**按钮样式**：
- 使用现有的 `Button` 组件，`variant="ghost"`
- 选中状态：高亮显示（使用 `data-active` 或类似机制）
- 图标 + 文字（侧边栏展开时）/ 仅图标（侧边栏收起时）

### 2.2 Workspace 视图（现有功能）

保持现有的项目列表和 Session 列表功能不变。

### 2.3 定时任务视图

**任务列表**：
- 显示所有定时任务
- 每个任务显示：名称、cron 表达式（人类可读格式）、启用状态、上次执行时间
- 支持启用/禁用任务的快捷操作
- 点击任务进入任务详情

**任务详情**（点击某个任务后显示）：

```
┌─────────────────────────────────┐
│  ← 返回列表                      │
├─────────────────────────────────┤
│  任务配置                        │
│  ─────────────────────────────  │
│  名称: 获取抖音数据               │
│  执行时间: 每天 12:30            │
│  工作目录: /path/to/project     │
│  模型: claude-sonnet-4          │
│  状态: ● 已启用                  │
│                                 │
│  [编辑] [删除] [立即执行]         │
├─────────────────────────────────┤
│  执行历史                        │
│  ─────────────────────────────  │
│  • 2026-01-15 12:30 ✓ 成功      │
│  • 2026-01-14 12:30 ✓ 成功      │
│  • 2026-01-13 12:30 ✗ 失败      │
│                                 │
│  (点击可查看对应的 Session)       │
└─────────────────────────────────┘
```

## 3. 数据模型

### 3.1 定时任务 JSON 结构

存储位置：`~/.local/share/opencode/storage/scheduler/tasks.json`

```json
{
  "tasks": [
    {
      "id": "task_xxxxxxxx",
      "name": "获取抖音数据",
      "cron": "30 12 * * *",
      "cwd": "/path/to/project",
      "prompt": "执行 /douyin-data-collector 采集今日数据",
      "model": {
        "providerID": "anthropic",
        "modelID": "claude-sonnet-4-20250514"
      },
      "enabled": true,
      "createdAt": 1736956800000,
      "lastRunAt": 1736870400000,
      "lastRunStatus": "success",
      "lastSessionId": "session_xxxxxxxx"
    }
  ]
}
```

### 3.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 任务唯一标识，格式 `task_` + UUID |
| name | string | 是 | 任务名称，用于显示 |
| cron | string | 是 | Cron 表达式，定义执行时间 |
| cwd | string | 是 | 工作目录，任务执行时的当前目录 |
| prompt | string | 是 | 执行时输入给 Agent 的提示词 |
| model | object | 否 | 指定使用的模型，不指定则使用默认模型 |
| model.providerID | string | 是 | Provider ID |
| model.modelID | string | 是 | Model ID |
| enabled | boolean | 是 | 是否启用 |
| createdAt | number | 是 | 创建时间戳（毫秒） |
| lastRunAt | number | 否 | 上次执行时间戳 |
| lastRunStatus | string | 否 | 上次执行状态：`success` / `error` / `running` |
| lastSessionId | string | 否 | 上次执行创建的 Session ID |

## 4. 后端实现

### 4.1 调度器模块

**文件位置**：`opencode-dev/packages/opencode/src/scheduler/`

```
scheduler/
├── index.ts        # 导出入口
├── scheduler.ts    # 调度器核心逻辑
└── task.ts         # 任务数据模型和操作
```

**调度器核心功能**：
- 使用 `node-cron` 或类似库实现 cron 调度
- 监听 tasks.json 文件变化，自动重新加载任务
- 任务执行时创建新的 Session，使用与人类对话相同的 Agent

**生命周期**：
- 随 OpenCode 后端服务启动而启动
- OpenCode 关闭时停止调度器
- 不作为独立后台进程运行

### 4.2 Agent Tool

**文件位置**：`opencode-dev/packages/opencode/src/tool/scheduler.ts`

让 Agent 可以通过 Tool 管理定时任务：

```typescript
export const SchedulerTool = {
  name: "scheduler",
  description: "管理定时任务。可以创建、更新、删除、列出定时任务。",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "update", "delete", "list", "get"],
        description: "操作类型"
      },
      taskId: {
        type: "string",
        description: "任务 ID（update/delete/get 时必填）"
      },
      task: {
        type: "object",
        description: "任务配置（create/update 时使用）",
        properties: {
          name: { type: "string" },
          cron: { type: "string" },
          cwd: { type: "string" },
          prompt: { type: "string" },
          model: {
            type: "object",
            properties: {
              providerID: { type: "string" },
              modelID: { type: "string" }
            }
          },
          enabled: { type: "boolean" }
        }
      }
    },
    required: ["action"]
  }
}
```

### 4.3 API 端点

在 Server 中添加以下 API：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/scheduler/tasks | 获取所有任务 |
| GET | /api/scheduler/tasks/:id | 获取单个任务 |
| POST | /api/scheduler/tasks | 创建任务 |
| PUT | /api/scheduler/tasks/:id | 更新任务 |
| DELETE | /api/scheduler/tasks/:id | 删除任务 |
| POST | /api/scheduler/tasks/:id/run | 立即执行任务 |
| GET | /api/scheduler/tasks/:id/history | 获取任务执行历史 |

## 5. 前端实现

### 5.1 修改文件

**主要修改**：`opencode-pro/packages/app/src/pages/layout.tsx`

1. 在侧边栏顶部添加导航切换按钮
2. 根据选中状态切换显示内容

**新增文件**：

```
opencode-pro/packages/app/src/
├── components/
│   ├── scheduler/
│   │   ├── task-list.tsx       # 任务列表组件
│   │   ├── task-detail.tsx     # 任务详情组件
│   │   ├── task-form.tsx       # 任务编辑表单
│   │   └── task-history.tsx    # 执行历史组件
│   └── dialog-create-task.tsx  # 创建任务对话框
├── context/
│   └── scheduler.tsx           # 定时任务状态管理
└── hooks/
    └── use-scheduler.ts        # 定时任务相关 hooks
```

### 5.2 状态管理

在 `context/scheduler.tsx` 中管理：
- 当前选中的视图（workspace / scheduler）
- 任务列表数据
- 当前选中的任务
- 加载状态

### 5.3 侧边栏导航组件

```tsx
// 伪代码示意
function SidebarNav() {
  const [activeView, setActiveView] = createSignal<'workspace' | 'scheduler'>('workspace')

  return (
    <div class="flex gap-1 px-2">
      <Button
        variant="ghost"
        data-active={activeView() === 'workspace'}
        onClick={() => setActiveView('workspace')}
      >
        <Icon name="folder" />
        <Show when={layout.sidebar.opened()}>Workspace</Show>
      </Button>
      <Button
        variant="ghost"
        data-active={activeView() === 'scheduler'}
        onClick={() => setActiveView('scheduler')}
      >
        <Icon name="clock" />
        <Show when={layout.sidebar.opened()}>定时任务</Show>
      </Button>
    </div>
  )
}
```

## 6. 用户交互流程

### 6.1 通过 UI 创建定时任务

1. 用户点击侧边栏「定时任务」按钮
2. 点击「+ 新建任务」按钮
3. 填写任务配置表单：
   - 任务名称
   - 执行时间（可视化 cron 编辑器或预设选项）
   - 工作目录（选择已打开的项目或手动输入）
   - 提示词（要执行的指令）
   - 模型（可选）
4. 保存任务

### 6.2 通过对话创建定时任务

用户可以直接与 Agent 对话来创建定时任务：

**用户**：每天中午 12 点半帮我执行 /douyin-data-collector 采集数据

**Agent**：好的，我来为您创建一个定时任务。
- 任务名称：采集抖音数据
- 执行时间：每天 12:30
- 工作目录：/current/project/path
- 执行指令：/douyin-data-collector

确认创建吗？

**用户**：确认

**Agent**：[调用 scheduler tool 创建任务]
定时任务已创建成功！您可以在侧边栏的「定时任务」面板中查看和管理。

### 6.3 定时任务执行

1. 调度器在指定时间触发任务
2. 创建一个新的 Session（标记为定时任务触发）
3. 使用配置的 prompt 作为用户输入
4. Agent 执行完整的任务流程（可调用 tools、skills、执行命令等）
5. 执行完成后更新任务状态和执行历史
6. Session 保存在定时任务的执行历史中，不混入普通对话列表

## 7. 定时任务 Session 的特殊处理

### 7.1 Session 标记

定时任务创建的 Session 需要特殊标记：

```typescript
interface Session {
  // ... 现有字段
  trigger?: {
    type: 'user' | 'scheduled'
    taskId?: string  // 如果是定时任务触发，记录任务 ID
  }
}
```

### 7.2 Session 存储

定时任务的 Session 存储在与普通 Session 相同的位置，但通过 `trigger.type` 字段区分。

在 Workspace 视图中，默认不显示定时任务触发的 Session（可通过设置开启显示）。

在定时任务视图的执行历史中，显示该任务触发的所有 Session。

## 8. 权限和安全

### 8.1 定时任务权限

定时任务执行时：
- 使用与人类对话相同的权限系统
- 如果需要权限确认，任务会暂停并等待用户处理
- 可以配置自动批准规则（与现有权限系统集成）

### 8.2 任务修改权限

- Agent 可以通过 Tool 修改定时任务
- 用户可以通过 UI 修改定时任务
- 建议：敏感操作（如删除任务）需要用户确认

## 9. 实现优先级

### Phase 1：基础功能
1. 后端调度器核心实现
2. 任务数据模型和存储
3. 基础 API 端点
4. 前端侧边栏导航切换
5. 任务列表显示

### Phase 2：完整功能
1. 任务详情页面
2. 任务创建/编辑表单
3. 执行历史显示
4. Agent Tool 实现

### Phase 3：增强功能
1. 可视化 cron 编辑器
2. 任务执行通知
3. 任务执行日志查看
4. 任务模板

## 10. 技术栈

- **前端**：SolidJS + Tailwind CSS（与现有项目一致）
- **后端**：Node.js + Hono（与现有项目一致）
- **调度库**：`node-cron` 或 `croner`
- **存储**：JSON 文件（与现有 Storage 系统一致）

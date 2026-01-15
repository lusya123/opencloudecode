# 需求文档：模型名称显示渠道标识

## 背景

当前系统中，同一个模型可能配置了多个渠道（Provider），但在 UI 上显示时，所有模型名称都相同，用户难以区分。

## 需求目标

在模型名称后面添加渠道名称标识，格式为 `模型名称 (渠道名称)`，方便用户区分不同渠道的同名模型。

## 显示规则

| 场景 | 显示格式 |
|------|----------|
| 同一模型存在多个渠道 | `模型名称 (渠道名称)` |
| 模型只有一个渠道 | `模型名称` |

## 影响范围

| 位置 | 文件路径 | 说明 |
|------|----------|------|
| 对话模型选择器 | `opencode-dev/packages/app/src/components/prompt-input.tsx:1590` | 输入框上方的模型选择按钮 |
| 模型选择弹窗 | `opencode-dev/packages/app/src/components/dialog-select-model.tsx:56` | 点击后弹出的模型列表 |
| 模型管理设置页 | `opencode-dev/packages/app/src/components/dialog-manage-models.tsx` | 用户管理模型可见性的页面 |

## 数据结构

- 渠道名称字段：`Provider.name`
- 模型名称字段：`Model.name`
- 模型与渠道关系：每个 Provider 包含多个 Model，通过 `providerID` 关联

## 实现思路

1. 创建一个工具函数，判断某个模型是否存在于多个渠道中
2. 创建一个显示名称格式化函数，根据判断结果返回带或不带渠道名称的模型名称
3. 在上述三个位置调用该函数显示模型名称

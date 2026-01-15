# 自定义 Provider 功能需求文档

## 1. 背景

opencode 目前支持从 models.dev 加载预定义的 Provider（如 Anthropic、OpenAI 等），但用户可能需要添加自己的 API 服务（如私有部署的 LLM、第三方代理服务等）。本文档描述如何在前端实现自定义 Provider 的添加、编辑和删除功能。

## 2. 功能概述

允许用户通过前端界面添加自定义的 AI Provider，包括：
- 自定义渠道名称
- 自定义 Base URL
- 自定义 API Key
- 自定义模型列表

添加后，用户可以在对话时选择自定义渠道的模型进行使用。

## 3. 技术背景

### 3.1 后端已有支持

opencode 后端已完整支持自定义 Provider，无需修改后端代码：

1. **配置加载机制** ([provider.ts:713-793](packages/opencode/src/provider/provider.ts#L713-L793))：
   - 后端会从配置文件读取 `provider` 字段
   - 自定义 Provider 会被添加到 `database` 中
   - 默认使用 `@ai-sdk/openai-compatible` SDK（兼容 OpenAI API 格式）

2. **热更新机制** ([config.ts:1211-1216](packages/opencode/src/config/config.ts#L1211-L1216))：
   - `Config.update()` 保存配置后会调用 `Instance.dispose()`
   - 系统自动清除缓存并重新加载配置
   - 无需重启后端服务

3. **现有 API**：
   - `PATCH /config` - 更新配置（包括自定义 Provider）
   - `GET /provider` - 获取所有 Provider 列表（包含自定义的）
   - `GET /config` - 获取当前配置

### 3.2 配置数据结构

自定义 Provider 的配置格式（定义于 [config.ts:787-838](packages/opencode/src/config/config.ts#L787-L838)）：

```typescript
interface ProviderConfig {
  name?: string           // Provider 显示名称
  api?: string            // Base URL
  npm?: string            // SDK 包名，默认 "@ai-sdk/openai-compatible"
  env?: string[]          // 环境变量名列表（可选）
  options?: {
    apiKey?: string       // API 密钥
    baseURL?: string      // Base URL（优先级高于 api 字段）
    timeout?: number      // 请求超时时间（毫秒）
    [key: string]: any    // 其他 SDK 选项
  }
  models?: {
    [modelId: string]: {
      name?: string       // 模型显示名称
      id?: string         // 模型 API ID（可选，默认使用 key）
      // 以下为可选配置
      limit?: {
        context?: number  // 上下文长度限制
        output?: number   // 输出长度限制
      }
      cost?: {
        input?: number    // 输入价格（每百万 token）
        output?: number   // 输出价格（每百万 token）
      }
      temperature?: boolean  // 是否支持 temperature 参数
      reasoning?: boolean    // 是否支持推理模式
      tool_call?: boolean    // 是否支持工具调用
    }
  }
  whitelist?: string[]    // 模型白名单
  blacklist?: string[]    // 模型黑名单
}
```

### 3.3 完整配置示例

```json
{
  "provider": {
    "my-openai-proxy": {
      "name": "我的 OpenAI 代理",
      "api": "https://api.example.com/v1",
      "options": {
        "apiKey": "sk-xxxxxxxx"
      },
      "models": {
        "gpt-4o": {
          "name": "GPT-4o"
        },
        "gpt-4o-mini": {
          "name": "GPT-4o Mini"
        }
      }
    },
    "my-claude-proxy": {
      "name": "我的 Claude 代理",
      "api": "https://claude-proxy.example.com/v1",
      "options": {
        "apiKey": "sk-yyyyyyyy"
      },
      "models": {
        "claude-3-5-sonnet": {
          "name": "Claude 3.5 Sonnet"
        },
        "claude-3-5-haiku": {
          "name": "Claude 3.5 Haiku"
        }
      }
    }
  }
}
```

## 4. 前端实现需求

### 4.1 入口位置

在模型选择对话框（`dialog-select-model.tsx`）或 Provider 连接对话框（`dialog-select-provider.tsx`）中添加 "添加自定义渠道" 入口。

### 4.2 添加自定义 Provider 对话框

#### 4.2.1 表单字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 渠道名称 | 文本输入 | 是 | 显示名称，如 "我的 OpenAI 代理" |
| Base URL | 文本输入 | 是 | API 服务地址，如 `https://api.example.com/v1` |
| API Key | 密码输入 | 是 | 认证密钥 |
| 模型列表 | 动态列表 | 是 | 至少包含一个模型 |

#### 4.2.2 模型列表交互

- 默认显示一个空的模型输入行
- 每行包含：模型 ID 输入框、模型显示名称输入框、删除按钮
- 点击 "+" 按钮添加新行
- 至少保留一个模型，最后一个不可删除

#### 4.2.3 表单验证

- 渠道名称：非空
- Base URL：非空，需为有效 URL 格式
- API Key：非空
- 模型列表：至少一个模型，模型 ID 非空

### 4.3 Provider ID 生成规则

为避免与现有 Provider 冲突，建议使用以下格式：
- `custom-{timestamp}` 或
- `custom-{name-slug}`（将名称转为 URL 友好格式）

### 4.4 保存逻辑

```typescript
// 伪代码
async function saveCustomProvider(form: CustomProviderForm) {
  const providerId = `custom-${Date.now()}`

  const config = {
    provider: {
      [providerId]: {
        name: form.name,
        api: form.baseUrl,
        options: {
          apiKey: form.apiKey
        },
        models: form.models.reduce((acc, m) => {
          acc[m.id] = { name: m.name || m.id }
          return acc
        }, {})
      }
    }
  }

  // 调用 API 保存配置
  await sdk.config.update(config)

  // 配置保存后，后端会自动热重载
  // 前端监听 SSE 事件或主动刷新 provider 列表
}
```

### 4.5 编辑已有的自定义 Provider

- 在 Provider 列表中，为自定义 Provider 显示编辑按钮
- 点击编辑按钮打开对话框，预填充现有配置
- 保存时覆盖原有配置

#### 4.5.1 识别自定义 Provider

方法一：检查 Provider ID 前缀
```typescript
const isCustomProvider = (providerId: string) => providerId.startsWith('custom-')
```

方法二：使用 localStorage 记录
```typescript
// 保存时记录
localStorage.setItem('opencode.custom-providers', JSON.stringify([providerId, ...]))

// 读取时判断
const customProviders = JSON.parse(localStorage.getItem('opencode.custom-providers') || '[]')
const isCustomProvider = customProviders.includes(providerId)
```

### 4.6 删除自定义 Provider

由于 `PATCH /config` 使用 `mergeDeep` 合并更新，**无法直接删除字段**。需要使用 `disabled_providers` 列表来禁用 Provider。

```typescript
async function deleteCustomProvider(providerId: string) {
  // 获取当前配置
  const currentConfig = await sdk.config.get()

  // 添加到 disabled_providers 列表
  const disabledProviders = currentConfig.disabled_providers || []
  if (!disabledProviders.includes(providerId)) {
    await sdk.config.update({
      disabled_providers: [...disabledProviders, providerId]
    })
  }
}
```

**注意**：
- 被禁用的 Provider 不会出现在 `GET /provider` 返回的 `connected` 列表中
- 后端在 [provider.ts:888-890](packages/opencode/src/provider/provider.ts#L888-L890) 会检查 `disabled_providers` 并过滤掉对应的 Provider
- 如需重新启用，从 `disabled_providers` 列表中移除该 ID 即可

### 4.7 模型选择界面的分组展示

修改 [dialog-select-model.tsx](packages/app/src/components/dialog-select-model.tsx) 中的分组逻辑：

```typescript
// 当前实现
groupBy={(x) => x.provider.name}

// 修改为
groupBy={(x) => {
  // 自定义 Provider 归类到 "Custom" 分组
  if (x.provider.id.startsWith('custom-')) {
    return 'Custom'
  }
  return x.provider.name
}}

// 分组排序
sortGroupsBy={(a, b) => {
  // Custom 分组排在最前面
  if (a.category === 'Custom') return -1
  if (b.category === 'Custom') return 1
  // 其他分组按原有逻辑排序
  // ...
}}
```

### 4.8 模型显示格式

对于自定义 Provider 的模型，显示格式为：
```
模型名称 (渠道名称)
```

例如：
```
GPT-4o (我的 OpenAI 代理)
Claude 3.5 Sonnet (我的 Claude 代理)
```

## 5. 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户操作                                   │
├─────────────────────────────────────────────────────────────────┤
│ 1. 用户点击 "添加自定义渠道"                                      │
│ 2. 填写表单：名称、Base URL、API Key、模型列表                    │
│ 3. 点击保存                                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        前端处理                                   │
├─────────────────────────────────────────────────────────────────┤
│ 1. 表单验证                                                      │
│ 2. 生成 Provider ID                                              │
│ 3. 构建配置对象                                                  │
│ 4. 调用 PATCH /config API                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        后端处理（自动）                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. Config.update() 合并配置并写入文件                            │
│ 2. Instance.dispose() 清除缓存                                   │
│ 3. 下次 Provider.list() 调用时重新加载配置                       │
│ 4. 自定义 Provider 出现在 connected 列表中                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        前端刷新                                   │
├─────────────────────────────────────────────────────────────────┤
│ 1. 监听 SSE 事件（server.instance.disposed）                     │
│ 2. 或主动调用 GET /provider 刷新列表                             │
│ 3. 更新 UI 显示新的 Provider 和模型                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        用户使用                                   │
├─────────────────────────────────────────────────────────────────┤
│ 1. 在模型选择对话框中看到 "Custom" 分组                          │
│ 2. 选择自定义模型进行对话                                        │
│ 3. 后端使用 @ai-sdk/openai-compatible SDK 发起请求               │
└─────────────────────────────────────────────────────────────────┘
```

## 6. 涉及文件

### 6.1 需要新建的文件

| 文件路径 | 说明 |
|----------|------|
| `src/components/dialog-custom-provider.tsx` | 自定义 Provider 配置对话框 |
| `src/hooks/use-custom-providers.ts` | 自定义 Provider 管理 Hook（可选） |

### 6.2 需要修改的文件

| 文件路径 | 修改内容 |
|----------|----------|
| `src/components/dialog-select-provider.tsx` | 添加 "添加自定义渠道" 入口 |
| `src/components/dialog-select-model.tsx` | 修改分组逻辑，添加 "Custom" 分组 |

## 7. UI 交互流程

### 7.1 添加新的自定义 Provider

```
用户点击 "Select model" 或 "Connect provider"
    ↓
显示对话框，底部有 "添加自定义渠道" 按钮
    ↓
用户点击 "添加自定义渠道"
    ↓
打开 DialogCustomProvider 对话框
    ↓
用户填写：渠道名称、Base URL、API Key
    ↓
用户添加模型（点击 + 添加更多）
    ↓
用户点击 "保存"
    ↓
前端调用 PATCH /config API
    ↓
保存成功，关闭对话框，显示成功提示
    ↓
新的 Provider 出现在 "Custom" 分组中
```

### 7.2 编辑已有的自定义 Provider

```
用户在 Provider 列表中看到自定义 Provider
    ↓
用户点击编辑按钮（仅对自定义 Provider 显示）
    ↓
打开 DialogCustomProvider 对话框（预填充现有配置）
    ↓
用户修改配置
    ↓
用户点击 "保存"
    ↓
前端调用 PATCH /config API 更新配置
    ↓
保存成功，关闭对话框
```

### 7.3 删除自定义 Provider

```
用户在编辑对话框中点击 "删除"
    ↓
显示确认对话框
    ↓
用户确认删除
    ↓
前端调用 API 移除配置
    ↓
Provider 从列表中消失
```

## 8. 注意事项

1. **API 兼容性**：默认使用 OpenAI 兼容格式，确保用户的 API 服务支持 OpenAI API 格式

2. **安全性**：API Key 应使用密码输入框，不在 UI 中明文显示

3. **错误处理**：
   - 配置保存失败时显示错误提示
   - API 调用失败时提供有意义的错误信息

4. **持久化**：配置保存在项目目录的 `config.json` 中，跟随项目

5. **热更新**：保存配置后无需重启后端，系统自动热重载

## 9. 验证清单

- [ ] 添加自定义 Provider 对话框 UI 完整
- [ ] 表单验证正常工作
- [ ] 保存配置成功调用 API
- [ ] 保存后列表自动刷新
- [ ] 自定义 Provider 出现在 "Custom" 分组
- [ ] 模型显示格式正确："模型名称 (渠道名称)"
- [ ] 可以编辑已有的自定义 Provider
- [ ] 可以删除自定义 Provider
- [ ] 对话时可以正常使用自定义模型
- [ ] API 调用正常（使用 OpenAI 兼容格式）

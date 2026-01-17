import { createContext, useContext, ParentProps, createSignal, onMount, batch, createMemo } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { usePlatform } from "./platform"
import { useServer } from "./server"

// CC Switch Provider 数据模型
export interface CCProvider {
  id: string
  name: string
  base_url: string
  api_key: string
  model?: string
  is_current: boolean
  created_at: string
  updated_at: string
  raw?: CCSwitchProvider
}

export interface CreateProviderInput {
  name: string
  base_url: string
  api_key: string
  model?: string
}

export interface UpdateProviderInput {
  name?: string
  base_url?: string
  api_key?: string
  model?: string
}

interface CCApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

interface CCSwitchProvider {
  id: string
  name: string
  settingsConfig: Record<string, unknown>
  websiteUrl?: string
  category?: string
  createdAt?: number
  sortIndex?: number
  notes?: string
  meta?: unknown
  icon?: string
  iconColor?: string
  inFailoverQueue?: boolean
}

interface CCSwitchProvidersPayload {
  providers: Record<string, CCSwitchProvider>
  current?: string | null
}

interface CCSwitchState {
  providers: CCProvider[]
  currentProvider: CCProvider | null
  loading: boolean
  error: string | null
  serverConnected: boolean
}

interface CCSwitchContextValue {
  state: CCSwitchState
  loadProviders: () => Promise<void>
  getCurrentProvider: () => Promise<void>
  addProvider: (input: CreateProviderInput) => Promise<CCProvider | null>
  updateProvider: (id: string, input: UpdateProviderInput) => Promise<CCProvider | null>
  deleteProvider: (id: string) => Promise<boolean>
  switchProvider: (id: string) => Promise<boolean>
  checkConnection: () => Promise<boolean>
}

const CCSwitchContext = createContext<CCSwitchContextValue>()

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-20250514"

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function getEnv(settingsConfig: unknown): Record<string, unknown> | undefined {
  if (!isRecord(settingsConfig)) return
  const env = settingsConfig.env
  return isRecord(env) ? env : undefined
}

function getEnvString(env: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = env?.[key]
  return typeof value === "string" ? value : undefined
}

function toCCProvider(raw: CCSwitchProvider, currentId?: string | null): CCProvider {
  const env = getEnv(raw.settingsConfig)
  const baseUrl = getEnvString(env, "ANTHROPIC_BASE_URL") ?? ""
  const apiKey =
    getEnvString(env, "ANTHROPIC_AUTH_TOKEN") ?? getEnvString(env, "ANTHROPIC_API_KEY") ?? ""
  const model = getEnvString(env, "ANTHROPIC_MODEL")
  const createdAt = raw.createdAt ? new Date(raw.createdAt).toISOString() : ""

  return {
    id: raw.id,
    name: raw.name,
    base_url: baseUrl,
    api_key: apiKey,
    model,
    is_current: raw.id === currentId,
    created_at: createdAt,
    updated_at: createdAt,
    raw,
  }
}

function generateProviderId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `cc-provider-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildClaudeSettingsConfig(
  input: CreateProviderInput,
  existingConfig?: Record<string, unknown>,
): Record<string, unknown> {
  const baseConfig = isRecord(existingConfig) ? { ...existingConfig } : {}
  const env = isRecord(baseConfig.env) ? { ...baseConfig.env } : {}
  const resolvedModel = input.model ?? getEnvString(env, "ANTHROPIC_MODEL") ?? DEFAULT_CLAUDE_MODEL

  env.ANTHROPIC_BASE_URL = input.base_url
  env.ANTHROPIC_AUTH_TOKEN = input.api_key
  env.ANTHROPIC_API_KEY = input.api_key

  if (resolvedModel) {
    env.ANTHROPIC_MODEL = resolvedModel
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = resolvedModel
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = resolvedModel
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = resolvedModel
  }

  baseConfig.env = env
  return baseConfig
}

export function CCSwitchProvider(props: ParentProps) {
  const platform = usePlatform()
  const server = useServer()
  const ccSwitchBaseUrl = createMemo(() => {
    if (server.url) return `${server.url}/cc-switch`
    return "http://127.0.0.1:8766/api"
  })

  const [state, setState] = createStore<CCSwitchState>({
    providers: [],
    currentProvider: null,
    loading: false,
    error: null,
    serverConnected: false,
  })

  async function fetchApi<T>(path: string, options?: RequestInit): Promise<CCApiResponse<T>> {
    const fetchFn = platform.fetch ?? fetch
    try {
      const response = await fetchFn(`${ccSwitchBaseUrl()}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      })
      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorText || response.statusText}`,
        }
      }
      return response.json()
    } catch (err) {
      console.error("CC Switch API error:", err)
      return {
        success: false,
        error: err instanceof Error ? err.message : "网络连接失败",
      }
    }
  }

  async function checkConnection(): Promise<boolean> {
    try {
      const result = await fetchApi<CCSwitchProvidersPayload>("/providers/app/claude")
      const connected = result.success
      setState("serverConnected", connected)
      return connected
    } catch {
      setState("serverConnected", false)
      return false
    }
  }

  async function loadProviders() {
    setState("loading", true)
    setState("error", null)
    try {
      const result = await fetchApi<CCSwitchProvidersPayload>("/providers/app/claude")
      if (result.success && result.data) {
        const providers = Object.values(result.data.providers ?? {}).map((provider) =>
          toCCProvider(provider, result.data.current ?? null),
        )
        batch(() => {
          setState("providers", reconcile(providers, { key: "id" }))
          setState("serverConnected", true)
          // 同时更新当前提供商
          const current = providers.find(p => p.is_current)
          setState("currentProvider", current || null)
        })
      } else {
        setState("error", result.error || "加载提供商列表失败")
        setState("serverConnected", false)
      }
    } catch (err) {
      setState("error", err instanceof Error ? err.message : "加载失败")
      setState("serverConnected", false)
    } finally {
      setState("loading", false)
    }
  }

  async function getCurrentProvider() {
    try {
      const result = await fetchApi<string>("/providers/app/claude/current")
      if (result.success && typeof result.data === "string") {
        const current = state.providers.find(p => p.id === result.data)
        if (current) {
          setState("currentProvider", current)
        } else {
          await loadProviders()
        }
      }
    } catch (err) {
      console.error("获取当前提供商失败:", err)
    }
  }

  async function addProvider(input: CreateProviderInput): Promise<CCProvider | null> {
    setState("loading", true)
    setState("error", null)
    try {
      const provider: CCSwitchProvider = {
        id: generateProviderId(),
        name: input.name,
        settingsConfig: buildClaudeSettingsConfig(input, state.currentProvider?.raw?.settingsConfig),
        createdAt: Date.now(),
        inFailoverQueue: false,
      }
      const result = await fetchApi<boolean>("/providers", {
        method: "POST",
        body: JSON.stringify({ app: "claude", provider }),
      })
      if (result.success) {
        // 重新加载列表以获取最新状态
        await loadProviders()
        return state.providers.find(p => p.id === provider.id) ?? toCCProvider(provider, null)
      } else {
        setState("error", result.error || "添加提供商失败")
        return null
      }
    } catch (err) {
      setState("error", err instanceof Error ? err.message : "添加失败")
      return null
    } finally {
      setState("loading", false)
    }
  }

  async function updateProvider(id: string, input: UpdateProviderInput): Promise<CCProvider | null> {
    setState("loading", true)
    setState("error", null)
    try {
      const existing = state.providers.find(p => p.id === id)
      const normalizedInput: CreateProviderInput = {
        name: input.name ?? existing?.name ?? "",
        base_url: input.base_url ?? existing?.base_url ?? "",
        api_key: input.api_key ?? existing?.api_key ?? "",
        model: input.model ?? existing?.model,
      }
      if (!normalizedInput.name || !normalizedInput.base_url || !normalizedInput.api_key) {
        setState("error", "提供商信息不完整，无法更新")
        return null
      }

      const provider: CCSwitchProvider = {
        ...(existing?.raw ?? {}),
        id,
        name: normalizedInput.name,
        settingsConfig: buildClaudeSettingsConfig(normalizedInput, existing?.raw?.settingsConfig),
      }
      const result = await fetchApi<boolean>(`/providers/item/${id}`, {
        method: "PUT",
        body: JSON.stringify({ app: "claude", provider }),
      })
      if (result.success) {
        await loadProviders()
        return state.providers.find(p => p.id === id) ?? toCCProvider(provider, state.currentProvider?.id)
      } else {
        setState("error", result.error || "更新提供商失败")
        return null
      }
    } catch (err) {
      setState("error", err instanceof Error ? err.message : "更新失败")
      return null
    } finally {
      setState("loading", false)
    }
  }

  async function deleteProvider(id: string): Promise<boolean> {
    setState("loading", true)
    setState("error", null)
    try {
      const result = await fetchApi<boolean>(`/providers/app/claude/${id}`, {
        method: "DELETE",
      })
      if (result.success) {
        await loadProviders()
        return true
      } else {
        setState("error", result.error || "删除提供商失败")
        return false
      }
    } catch (err) {
      setState("error", err instanceof Error ? err.message : "删除失败")
      return false
    } finally {
      setState("loading", false)
    }
  }

  async function switchProvider(id: string): Promise<boolean> {
    setState("loading", true)
    setState("error", null)
    try {
      const result = await fetchApi<boolean>(`/providers/app/claude/${id}/switch`, {
        method: "POST",
      })
      if (result.success) {
        await loadProviders()
        return true
      } else {
        setState("error", result.error || "切换提供商失败")
        return false
      }
    } catch (err) {
      setState("error", err instanceof Error ? err.message : "切换失败")
      return false
    } finally {
      setState("loading", false)
    }
  }

  const value: CCSwitchContextValue = {
    state,
    loadProviders,
    getCurrentProvider,
    addProvider,
    updateProvider,
    deleteProvider,
    switchProvider,
    checkConnection,
  }

  return <CCSwitchContext.Provider value={value}>{props.children}</CCSwitchContext.Provider>
}

export function useCCSwitch() {
  const context = useContext(CCSwitchContext)
  if (!context) {
    throw new Error("useCCSwitch must be used within a CCSwitchProvider")
  }
  return context
}

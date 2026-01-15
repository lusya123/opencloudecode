import { Component, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { showToast } from "@opencode-ai/ui/toast"
import { useGlobalSDK } from "@/context/global-sdk"

interface ModelEntry {
  id: string
  name: string
}

interface CustomProviderForm {
  name: string
  baseUrl: string
  apiKey: string
  models: ModelEntry[]
}

function normalizeOpenAICompatibleBaseUrl(input: string): { baseUrl: string; changed: boolean } {
  const raw = input.trim()
  try {
    const url = new URL(raw)
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/v1"
      return { baseUrl: url.toString(), changed: true }
    }
  } catch {
    // ignore - validation will handle
  }
  return { baseUrl: raw, changed: raw !== input }
}

export const DialogCustomProvider: Component<{
  providerId?: string
  initialData?: {
    name: string
    baseUrl: string
    apiKey: string
    models: ModelEntry[]
  }
}> = (props) => {
  const dialog = useDialog()
  const globalSDK = useGlobalSDK()

  const [form, setForm] = createStore<CustomProviderForm>({
    name: props.initialData?.name ?? "",
    baseUrl: props.initialData?.baseUrl ?? "",
    apiKey: props.initialData?.apiKey ?? "",
    models: props.initialData?.models ?? [{ id: "", name: "" }],
  })

  const [errors, setErrors] = createStore({
    name: "",
    baseUrl: "",
    apiKey: "",
    models: "",
  })

  const [saving, setSaving] = createSignal(false)

  function addModel() {
    setForm("models", (models) => [...models, { id: "", name: "" }])
  }

  function removeModel(index: number) {
    if (form.models.length <= 1) return
    setForm("models", (models) => models.filter((_, i) => i !== index))
  }

  function updateModel(index: number, field: keyof ModelEntry, value: string) {
    setForm("models", index, field, value)
  }

  function validate(): boolean {
    let valid = true
    setErrors({ name: "", baseUrl: "", apiKey: "", models: "" })

    if (!form.name.trim()) {
      setErrors("name", "渠道名称不能为空")
      valid = false
    }

    if (!form.baseUrl.trim()) {
      setErrors("baseUrl", "Base URL 不能为空")
      valid = false
    } else {
      try {
        const normalized = normalizeOpenAICompatibleBaseUrl(form.baseUrl)
        if (normalized.changed) setForm("baseUrl", normalized.baseUrl)
        new URL(normalized.baseUrl)
      } catch {
        setErrors("baseUrl", "请输入有效的 URL")
        valid = false
      }
    }

    if (!form.apiKey.trim()) {
      setErrors("apiKey", "API Key 不能为空")
      valid = false
    }

    const hasValidModel = form.models.some((m) => m.id.trim())
    if (!hasValidModel) {
      setErrors("models", "至少需要一个模型 ID")
      valid = false
    }

    return valid
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    console.log("handleSubmit called", { form })
    if (!validate()) {
      console.log("validation failed", { errors })
      return
    }
    console.log("validation passed, starting save...")

    setSaving(true)
    try {
      const providerId = props.providerId ?? `custom-${Date.now()}`
      const normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(form.baseUrl)
      if (normalizedBaseUrl.changed) {
        showToast({
          variant: "default",
          title: "已自动补全 Base URL",
          description: `已将 Base URL 规范化为 ${normalizedBaseUrl.baseUrl}`,
        })
      }
      const modelsConfig: Record<string, { name: string }> = {}

      for (const m of form.models) {
        if (m.id.trim()) {
          modelsConfig[m.id.trim()] = { name: m.name.trim() || m.id.trim() }
        }
      }

      console.log("calling auth.set...", { providerId })
      const authRes = await globalSDK.client.auth.set({
        providerID: providerId,
        auth: {
          type: "api",
          key: form.apiKey.trim(),
        },
      })
      console.log("auth.set done", authRes)

      console.log("calling global.configUpdate...", { providerId, modelsConfig })
      const configRes = await globalSDK.client.global.configUpdate({
        config: {
          provider: {
            [providerId]: {
              name: form.name.trim(),
              api: normalizedBaseUrl.baseUrl,
              models: modelsConfig,
            },
          },
        },
      })
      console.log("config.update done", configRes)

      console.log("calling global.dispose...")
      await globalSDK.client.global.dispose()
      console.log("global.dispose done")
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: props.providerId ? "自定义渠道已更新" : "自定义渠道已添加",
        description: `${form.name} 的模型现在可以使用了`,
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: "保存失败",
        description: String(err),
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!props.providerId) return

    setSaving(true)
    try {
      const configRes = await globalSDK.client.global.configGet()
      const currentConfig = configRes.data
      const disabledProviders = (currentConfig?.disabled_providers as string[]) ?? []

      if (!disabledProviders.includes(props.providerId)) {
        await globalSDK.client.global.configUpdate({
          config: {
            disabled_providers: [...disabledProviders, props.providerId],
          },
        })
      }

      await globalSDK.client.global.dispose()
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: "自定义渠道已删除",
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: "删除失败",
        description: String(err),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog title={props.providerId ? "编辑自定义渠道" : "添加自定义渠道"}>
      <form onSubmit={handleSubmit} class="flex flex-col gap-4 px-2.5 pb-3">
        <TextField
          autofocus
          label="渠道名称"
          placeholder="例如：我的 OpenAI 代理"
          value={form.name}
          onChange={(v) => setForm("name", v)}
          validationState={errors.name ? "invalid" : undefined}
          error={errors.name}
        />

        <TextField
          label="Base URL"
          placeholder="https://api.example.com/v1"
          value={form.baseUrl}
          onChange={(v) => setForm("baseUrl", v)}
          validationState={errors.baseUrl ? "invalid" : undefined}
          error={errors.baseUrl}
        />

        <TextField
          label="API Key"
          type="password"
          placeholder="sk-xxxxxxxx"
          value={form.apiKey}
          onChange={(v) => setForm("apiKey", v)}
          validationState={errors.apiKey ? "invalid" : undefined}
          error={errors.apiKey}
        />

        <div class="flex flex-col gap-2">
          <div class="text-13-medium text-text-base">模型列表</div>
          <For each={form.models}>
            {(model, index) => (
              <div class="flex gap-2 items-start">
                <TextField
                  class="flex-1"
                  placeholder="模型 ID (如 gpt-4o)"
                  value={model.id}
                  onChange={(v) => updateModel(index(), "id", v)}
                />
                <TextField
                  class="flex-1"
                  placeholder="显示名称 (可选)"
                  value={model.name}
                  onChange={(v) => updateModel(index(), "name", v)}
                />
                <IconButton
                  type="button"
                  icon="close"
                  variant="ghost"
                  disabled={form.models.length <= 1}
                  onClick={() => removeModel(index())}
                />
              </div>
            )}
          </For>
          <Show when={errors.models}>
            <div class="text-12-regular text-text-critical">{errors.models}</div>
          </Show>
          <Button type="button" variant="ghost" icon="plus-small" onClick={addModel} class="self-start">
            添加模型
          </Button>
        </div>

        <div class="flex gap-2 mt-4">
          <Button type="submit" variant="primary" disabled={saving()}>
            {saving() ? "保存中..." : "保存"}
          </Button>
          <Show when={props.providerId}>
            <Button type="button" variant="ghost" disabled={saving()} onClick={handleDelete}>
              删除
            </Button>
          </Show>
        </div>
      </form>
    </Dialog>
  )
}

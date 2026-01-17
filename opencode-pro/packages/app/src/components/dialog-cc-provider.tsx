import { Component, createSignal, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import type { CCProvider, CreateProviderInput, UpdateProviderInput } from "@/context/cc-switch"

interface ProviderForm {
  name: string
  base_url: string
  api_key: string
  model: string
}

export const DialogCCProvider: Component<{
  provider?: CCProvider
  onSave: (input: CreateProviderInput | UpdateProviderInput) => Promise<CCProvider | null>
}> = (props) => {
  const dialog = useDialog()

  const isEdit = () => !!props.provider

  const [form, setForm] = createStore<ProviderForm>({
    name: props.provider?.name ?? "",
    base_url: props.provider?.base_url ?? "",
    api_key: props.provider?.api_key ?? "",
    model: props.provider?.model ?? "",
  })

  const [errors, setErrors] = createStore({
    name: "",
    base_url: "",
    api_key: "",
  })

  const [saving, setSaving] = createSignal(false)

  function validate(): boolean {
    let valid = true
    setErrors({ name: "", base_url: "", api_key: "" })

    if (!form.name.trim()) {
      setErrors("name", "提供商名称不能为空")
      valid = false
    }

    if (!form.base_url.trim()) {
      setErrors("base_url", "API Base URL 不能为空")
      valid = false
    } else {
      try {
        new URL(form.base_url.trim())
      } catch {
        setErrors("base_url", "请输入有效的 URL")
        valid = false
      }
    }

    if (!form.api_key.trim()) {
      setErrors("api_key", "API Key 不能为空")
      valid = false
    }

    return valid
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!validate()) return

    setSaving(true)
    try {
      const input: CreateProviderInput | UpdateProviderInput = {
        name: form.name.trim(),
        base_url: form.base_url.trim(),
        api_key: form.api_key.trim(),
        model: form.model.trim() || undefined,
      }

      const result = await props.onSave(input)
      if (result) {
        dialog.close()
        showToast({
          variant: "success",
          icon: "circle-check",
          title: isEdit() ? "提供商已更新" : "提供商已添加",
          description: `${form.name} 配置已保存`,
        })
      }
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

  return (
    <Dialog title={isEdit() ? "编辑提供商" : "添加提供商"}>
      <form onSubmit={handleSubmit} class="flex flex-col gap-4 px-2.5 pb-3">
        <TextField
          autofocus
          label="提供商名称"
          placeholder="例如：PackyCode、AIGoCode"
          value={form.name}
          onChange={(v) => setForm("name", v)}
          validationState={errors.name ? "invalid" : undefined}
          error={errors.name}
        />

        <TextField
          label="API Base URL"
          placeholder="https://api.example.com"
          value={form.base_url}
          onChange={(v) => setForm("base_url", v)}
          validationState={errors.base_url ? "invalid" : undefined}
          error={errors.base_url}
        />

        <TextField
          label="API Key"
          type="password"
          placeholder="sk-xxxxxxxx"
          value={form.api_key}
          onChange={(v) => setForm("api_key", v)}
          validationState={errors.api_key ? "invalid" : undefined}
          error={errors.api_key}
        />

        <TextField
          label="模型 (可选)"
          placeholder="claude-sonnet-4-20250514"
          value={form.model}
          onChange={(v) => setForm("model", v)}
        />

        <div class="flex gap-2 mt-4">
          <Button type="submit" variant="primary" disabled={saving()}>
            {saving() ? "保存中..." : "保存"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => dialog.close()}>
            取消
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

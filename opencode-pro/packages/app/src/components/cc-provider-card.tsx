import { Component, Show, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import type { CCProvider } from "@/context/cc-switch"

interface ProviderCardProps {
  provider: CCProvider
  onSwitch: (id: string) => Promise<void>
  onEdit: (provider: CCProvider) => void
  onDelete: (id: string) => Promise<void>
  loading?: boolean
}

export const ProviderCard: Component<ProviderCardProps> = (props) => {
  const [switching, setSwitching] = createSignal(false)
  const [deleting, setDeleting] = createSignal(false)

  const handleSwitch = async () => {
    if (props.provider.is_current) return
    setSwitching(true)
    try {
      await props.onSwitch(props.provider.id)
    } finally {
      setSwitching(false)
    }
  }

  const handleDelete = async () => {
    if (props.provider.is_current) return
    if (!confirm(`确定要删除提供商 "${props.provider.name}" 吗？`)) return
    setDeleting(true)
    try {
      await props.onDelete(props.provider.id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      classList={{
        "p-3 rounded-lg border transition-all": true,
        "border-primary bg-background-element": props.provider.is_current,
        "border-border-weak-base bg-background-base hover:bg-background-element": !props.provider.is_current,
      }}
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <Show when={props.provider.is_current}>
            <Icon name="circle-check" size="small" class="text-primary shrink-0" />
          </Show>
          <Show when={!props.provider.is_current}>
            <Icon name="server" size="small" class="text-text-muted shrink-0" />
          </Show>
          <div class="min-w-0 flex-1">
            <div class="text-13-medium text-text-strong truncate">{props.provider.name}</div>
            <div class="text-12-regular text-text-muted truncate">{props.provider.base_url}</div>
            <Show when={props.provider.model}>
              <div class="text-11-regular text-text-muted truncate mt-0.5">
                模型: {props.provider.model}
              </div>
            </Show>
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <Show when={!props.provider.is_current}>
            <Button
              variant="primary"
              size="small"
              disabled={switching() || props.loading}
              onClick={handleSwitch}
            >
              {switching() ? "切换中..." : "切换"}
            </Button>
          </Show>
          <Show when={props.provider.is_current}>
            <span class="text-12-medium text-primary px-2">当前使用</span>
          </Show>
        </div>
      </div>
      <div class="flex items-center gap-1 mt-2 pt-2 border-t border-border-weak-base">
        <Button
          variant="ghost"
          size="small"
          onClick={() => props.onEdit(props.provider)}
        >
          <Icon name="edit" size="small" />
          编辑
        </Button>
        <Tooltip
          value={props.provider.is_current ? "不能删除当前使用的提供商" : "删除此提供商"}
          placement="top"
        >
          <Button
            variant="ghost"
            size="small"
            disabled={props.provider.is_current || deleting() || props.loading}
            onClick={handleDelete}
          >
            <Icon name="trash" size="small" />
            {deleting() ? "删除中..." : "删除"}
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}

import { Component, For, Show, onMount, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { useCCSwitch, type CCProvider, type CreateProviderInput } from "@/context/cc-switch"
import { ProviderCard } from "./cc-provider-card"
import { DialogCCProvider } from "./dialog-cc-provider"

export const ClaudeSwitchTab: Component = () => {
  const ccSwitch = useCCSwitch()
  const dialog = useDialog()
  const [initialized, setInitialized] = createSignal(false)

  onMount(async () => {
    await ccSwitch.loadProviders()
    setInitialized(true)
  })

  const handleAddProvider = () => {
    dialog.show(() => (
      <DialogCCProvider
        onSave={async (input) => {
          const result = await ccSwitch.addProvider(input as CreateProviderInput)
          return result
        }}
      />
    ))
  }

  const handleEditProvider = (provider: CCProvider) => {
    dialog.show(() => (
      <DialogCCProvider
        provider={provider}
        onSave={async (input) => {
          const result = await ccSwitch.updateProvider(provider.id, input)
          return result
        }}
      />
    ))
  }

  const handleSwitchProvider = async (id: string) => {
    const success = await ccSwitch.switchProvider(id)
    if (success) {
      const provider = ccSwitch.state.providers.find(p => p.id === id)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: "切换成功",
        description: `已切换到 ${provider?.name || "新提供商"}`,
      })
    } else {
      showToast({
        variant: "error",
        title: "切换失败",
        description: ccSwitch.state.error || "请稍后重试",
      })
    }
  }

  const handleDeleteProvider = async (id: string) => {
    const success = await ccSwitch.deleteProvider(id)
    if (success) {
      showToast({
        variant: "success",
        icon: "circle-check",
        title: "删除成功",
      })
    } else {
      showToast({
        variant: "error",
        title: "删除失败",
        description: ccSwitch.state.error || "请稍后重试",
      })
    }
  }

  const handleRefresh = async () => {
    await ccSwitch.loadProviders()
  }

  return (
    <div class="w-full min-h-0 flex flex-col overflow-hidden">
      {/* 标题栏 */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-border-weak-base shrink-0">
        <div class="text-13-medium text-text-strong">Claude Code 提供商</div>
        <Button variant="ghost" size="small" onClick={handleRefresh} disabled={ccSwitch.state.loading}>
          <Icon name="refresh" size="small" class={ccSwitch.state.loading ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* 当前提供商状态 */}
      <Show when={ccSwitch.state.currentProvider}>
        {(currentProvider) => (
          <div class="px-3 py-2 bg-background-element border-b border-border-weak-base shrink-0">
            <div class="flex items-center gap-2">
              <Icon name="circle-check" size="small" class="text-primary" />
              <span class="text-12-medium text-text-strong">当前:</span>
              <span class="text-12-regular text-text-base truncate">
                {currentProvider().name}
              </span>
            </div>
          </div>
        )}
      </Show>

      {/* 连接状态提示 */}
      <Show when={!ccSwitch.state.serverConnected && initialized() && !ccSwitch.state.loading}>
        <div class="px-3 py-4 flex flex-col items-center gap-3">
          <Icon name="server" size="medium" class="text-text-muted" />
          <div class="text-center">
            <div class="text-13-medium text-text-strong">无法连接到 CC Switch 服务</div>
            <div class="text-12-regular text-text-muted mt-1">
              请确保 CC Switch HTTP 服务正在运行
            </div>
            <div class="text-11-regular text-text-muted mt-0.5">
              默认地址: http://127.0.0.1:8766
            </div>
          </div>
          <Button variant="ghost" size="small" onClick={handleRefresh}>
            <Icon name="refresh" size="small" />
            重试连接
          </Button>
        </div>
      </Show>

      {/* 加载中 */}
      <Show when={ccSwitch.state.loading && !initialized()}>
        <div class="flex-1 flex items-center justify-center">
          <Spinner class="w-6 h-6" />
        </div>
      </Show>

      {/* 提供商列表 */}
      <Show when={ccSwitch.state.serverConnected && initialized()}>
        <div class="flex-1 overflow-y-auto no-scrollbar p-3">
          <div class="flex flex-col gap-2">
            <For each={ccSwitch.state.providers}>
              {(provider) => (
                <ProviderCard
                  provider={provider}
                  onSwitch={handleSwitchProvider}
                  onEdit={handleEditProvider}
                  onDelete={handleDeleteProvider}
                  loading={ccSwitch.state.loading}
                />
              )}
            </For>

            {/* 空状态 */}
            <Show when={ccSwitch.state.providers.length === 0 && !ccSwitch.state.loading}>
              <div class="py-8 flex flex-col items-center gap-3">
                <Icon name="server" size="medium" class="text-text-muted" />
                <div class="text-center">
                  <div class="text-13-medium text-text-strong">暂无提供商</div>
                  <div class="text-12-regular text-text-muted mt-1">
                    添加一个 Claude Code API 提供商开始使用
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </div>

        {/* 添加按钮 */}
        <div class="px-3 py-2 border-t border-border-weak-base shrink-0">
          <Button
            variant="ghost"
            size="large"
            class="w-full justify-start"
            icon="plus"
            onClick={handleAddProvider}
          >
            添加提供商
          </Button>
        </div>
      </Show>

      {/* 错误提示 */}
      <Show when={ccSwitch.state.error && initialized()}>
        <div class="px-3 py-2 bg-background-error/10 text-text-error text-12-regular">
          {ccSwitch.state.error}
        </div>
      </Show>
    </div>
  )
}

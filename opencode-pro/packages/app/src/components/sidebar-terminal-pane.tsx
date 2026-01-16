import { createEffect, createMemo, For, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import { Tabs } from "@opencode-ai/ui/tabs"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { SDKProvider } from "@/context/sdk"
import { TerminalProvider, useTerminal, type LocalPTY } from "@/context/terminal"
import { Terminal } from "@/components/terminal"
import { useLayout } from "@/context/layout"
import { useScheduler } from "@/context/scheduler"
import { useCommand } from "@/context/command"

function SidebarTerminalContent() {
  const layout = useLayout()
  const scheduler = useScheduler()
  const command = useCommand()
  const terminal = useTerminal()

  createEffect(() => {
    if (!scheduler.state.sidebarTerminalVisible) return
    if (!terminal.ready()) return
    if (terminal.all().length !== 0) return
    terminal.new()
  })

  return (
    <div
      class="relative w-full flex-col shrink-0 border-t border-border-weak-base mt-auto"
      style={{ height: `${layout.terminal.height()}px` }}
    >
      <ResizeHandle
        direction="vertical"
        size={layout.terminal.height()}
        min={100}
        max={window.innerHeight * 0.6}
        collapseThreshold={50}
        onResize={layout.terminal.resize}
        onCollapse={() => scheduler.setSidebarTerminalVisible(false)}
      />

      <Show
        when={terminal.ready()}
        fallback={
          <div class="flex flex-col h-full pointer-events-none">
            <div class="h-10 flex items-center gap-2 px-2 border-b border-border-weak-base bg-background-stronger overflow-hidden">
              <div class="flex-1" />
              <div class="text-text-weak pr-2">Loading...</div>
            </div>
            <div class="flex-1 flex items-center justify-center text-text-weak">Loading terminal...</div>
          </div>
        }
      >
        <Tabs variant="alt" value={terminal.active()} onChange={terminal.open}>
          <Tabs.List class="h-10">
            <For each={terminal.all()}>
              {(pty) => (
                <Tabs.Trigger
                  value={pty.id}
                  closeButton={
                    terminal.all().length > 1 && (
                      <IconButton icon="close" variant="ghost" onClick={() => terminal.close(pty.id)} />
                    )
                  }
                >
                  {pty.title}
                </Tabs.Trigger>
              )}
            </For>
            <div class="h-full flex items-center justify-center">
              <TooltipKeybind title="New terminal" keybind={command.keybind("terminal.new")} class="flex items-center">
                <IconButton icon="plus-small" variant="ghost" iconSize="large" onClick={terminal.new} />
              </TooltipKeybind>
            </div>
          </Tabs.List>
          <For each={terminal.all()}>
            {(pty: LocalPTY) => (
              <Tabs.Content value={pty.id}>
                <Terminal pty={pty} onCleanup={terminal.update} onConnectError={() => terminal.clone(pty.id)} />
              </Tabs.Content>
            )}
          </For>
        </Tabs>
      </Show>
    </div>
  )
}

export function SidebarTerminalPane() {
  const params = useParams()
  const scheduler = useScheduler()

  const shouldShow = createMemo(() => !params.dir && scheduler.state.sidebarTerminalVisible)
  const directory = "/"

  return (
    <Show when={shouldShow()}>
      <SDKProvider directory={directory}>
        <TerminalProvider>
          <SidebarTerminalContent />
        </TerminalProvider>
      </SDKProvider>
    </Show>
  )
}

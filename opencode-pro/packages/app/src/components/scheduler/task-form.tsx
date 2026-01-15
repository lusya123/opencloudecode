import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { createSignal, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useScheduler, type SchedulerTask, type CreateTaskInput } from "@/context/scheduler"
import { useLayout } from "@/context/layout"

const CRON_PRESETS = [
  { label: "每天 12:00", value: "0 12 * * *" },
  { label: "每天 9:00", value: "0 9 * * *" },
  { label: "每天 18:00", value: "0 18 * * *" },
  { label: "工作日 9:00", value: "0 9 * * 1-5" },
  { label: "每小时", value: "0 * * * *" },
  { label: "每 30 分钟", value: "*/30 * * * *" },
]

export function DialogCreateTask(props: { task?: SchedulerTask; onSuccess?: () => void }) {
  const dialog = useDialog()
  const scheduler = useScheduler()
  const layout = useLayout()

  const isEdit = () => !!props.task

  const currentProject = () => layout.projects.list()[0]

  const [store, setStore] = createStore({
    name: props.task?.name ?? "",
    cron: props.task?.cron ?? "0 12 * * *",
    cwd: props.task?.cwd ?? currentProject()?.worktree ?? "",
    prompt: props.task?.prompt ?? "",
    enabled: props.task?.enabled ?? true,
    saving: false,
  })

  const [showCustomCron, setShowCustomCron] = createSignal(
    !CRON_PRESETS.some((p) => p.value === store.cron),
  )

  const isValid = () => store.name.trim() && store.cron.trim() && store.cwd.trim() && store.prompt.trim()

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!isValid()) return

    setStore("saving", true)
    try {
      const input: CreateTaskInput = {
        name: store.name.trim(),
        cron: store.cron.trim(),
        cwd: store.cwd.trim(),
        prompt: store.prompt.trim(),
        enabled: store.enabled,
      }

      if (isEdit()) {
        await scheduler.updateTask(props.task!.id, input)
      } else {
        await scheduler.createTask(input)
      }

      props.onSuccess?.()
      dialog.close()
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <Dialog title={isEdit() ? "编辑定时任务" : "创建定时任务"}>
      <form onSubmit={handleSubmit} class="flex flex-col gap-4 px-2.5 pb-3">
        <TextField
          autofocus
          type="text"
          label="任务名称"
          placeholder="例如：采集抖音数据"
          value={store.name}
          onChange={(v) => setStore("name", v)}
        />

        <div class="flex flex-col gap-2">
          <label class="text-12-medium text-text-weak">执行时间</label>
          <div class="flex flex-wrap gap-2">
            {CRON_PRESETS.map((preset) => (
              <button
                type="button"
                class="px-2 py-1 text-12-regular rounded-md transition-colors"
                classList={{
                  "bg-surface-info-base text-text-info-base": store.cron === preset.value && !showCustomCron(),
                  "bg-surface-base hover:bg-surface-base-hover text-text-base": store.cron !== preset.value || showCustomCron(),
                }}
                onClick={() => {
                  setStore("cron", preset.value)
                  setShowCustomCron(false)
                }}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              class="px-2 py-1 text-12-regular rounded-md transition-colors"
              classList={{
                "bg-surface-info-base text-text-info-base": showCustomCron(),
                "bg-surface-base hover:bg-surface-base-hover text-text-base": !showCustomCron(),
              }}
              onClick={() => setShowCustomCron(true)}
            >
              自定义
            </button>
          </div>
          <Show when={showCustomCron()}>
            <TextField
              type="text"
              placeholder="Cron 表达式，例如：30 12 * * *"
              value={store.cron}
              onChange={(v) => setStore("cron", v)}
            />
            <span class="text-12-regular text-text-subtle">
              格式：分 时 日 月 周（例如 30 12 * * * 表示每天 12:30）
            </span>
          </Show>
        </div>

        <TextField
          type="text"
          label="工作目录"
          placeholder="任务执行时的工作目录"
          value={store.cwd}
          onChange={(v) => setStore("cwd", v)}
        />

        <div class="flex flex-col gap-2">
          <label class="text-12-medium text-text-weak">提示词</label>
          <textarea
            class="w-full h-24 px-3 py-2 text-14-regular text-text-base bg-surface-base border border-border-base rounded-md resize-none focus:outline-none focus:border-border-strong"
            placeholder="执行时输入给 Agent 的提示词"
            value={store.prompt}
            onInput={(e) => setStore("prompt", e.currentTarget.value)}
          />
        </div>

        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="enabled"
            checked={store.enabled}
            onChange={(e) => setStore("enabled", e.currentTarget.checked)}
            class="size-4 rounded border-border-base"
          />
          <label for="enabled" class="text-14-regular text-text-base">
            创建后立即启用
          </label>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="large" onClick={() => dialog.close()}>
            取消
          </Button>
          <Button type="submit" variant="primary" size="large" disabled={store.saving || !isValid()}>
            {store.saving ? "保存中..." : isEdit() ? "保存" : "创建"}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

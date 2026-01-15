import { createMemo, Show } from "solid-js"
import { DateTime } from "luxon"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useScheduler } from "@/context/scheduler"
import { getFilename } from "@opencode-ai/util/path"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"

function cronToHuman(cron: string): string {
  const parts = cron.split(" ")
  if (parts.length !== 5) return cron

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  if (dayOfMonth === "*" && month === "*") {
    if (dayOfWeek === "*") {
      if (hour === "*") {
        return `每小时 ${minute} 分`
      }
      return `每天 ${hour}:${minute.padStart(2, "0")}`
    }
    if (dayOfWeek === "1-5") {
      return `工作日 ${hour}:${minute.padStart(2, "0")}`
    }
  }

  if (dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
    return `每月 ${dayOfMonth} 日 ${hour}:${minute.padStart(2, "0")}`
  }

  return cron
}

export function TaskDetail(props: { onEdit: () => void; onBack: () => void }) {
  const scheduler = useScheduler()
  const navigate = useNavigate()

  const task = createMemo(() =>
    scheduler.state.tasks.find((t) => t.id === scheduler.state.selectedTaskId),
  )

  const lastRun = createMemo(() =>
    task()?.lastRunAt ? DateTime.fromMillis(task()!.lastRunAt!) : null,
  )

  const handleToggle = async () => {
    const t = task()
    if (!t) return
    await scheduler.updateTask(t.id, { enabled: !t.enabled })
  }

  const handleRun = async () => {
    const t = task()
    if (!t) return
    const sessionId = await scheduler.runTask(t.id)
    if (sessionId) {
      navigate(`/${base64Encode(t.cwd)}/session/${sessionId}`)
    }
  }

  const handleDelete = async () => {
    const t = task()
    if (!t) return
    if (confirm(`确定要删除任务「${t.name}」吗？`)) {
      await scheduler.deleteTask(t.id)
      props.onBack()
    }
  }

  const handleViewSession = () => {
    const t = task()
    if (!t?.lastSessionId) return
    navigate(`/${base64Encode(t.cwd)}/session/${t.lastSessionId}`)
  }

  return (
    <Show when={task()} fallback={<div class="p-4 text-text-weak">任务不存在</div>}>
      {(t) => (
        <div class="flex flex-col gap-4 w-full">
          <div class="flex items-center gap-2 px-2">
            <IconButton icon="arrow-left" variant="ghost" onClick={props.onBack} />
            <span class="text-14-medium text-text-strong truncate">{t().name}</span>
          </div>

          <div class="flex flex-col gap-3 px-4">
            <div class="flex flex-col gap-1">
              <span class="text-12-medium text-text-weak">执行时间</span>
              <span class="text-14-regular text-text-base">{cronToHuman(t().cron)}</span>
              <span class="text-12-regular text-text-subtle">{t().cron}</span>
            </div>

            <div class="flex flex-col gap-1">
              <span class="text-12-medium text-text-weak">工作目录</span>
              <span class="text-14-regular text-text-base">{getFilename(t().cwd)}</span>
              <span class="text-12-regular text-text-subtle truncate">{t().cwd}</span>
            </div>

            <Show when={t().model}>
              <div class="flex flex-col gap-1">
                <span class="text-12-medium text-text-weak">模型</span>
                <span class="text-14-regular text-text-base">
                  {t().model!.providerID}/{t().model!.modelID}
                </span>
              </div>
            </Show>

            <div class="flex flex-col gap-1">
              <span class="text-12-medium text-text-weak">状态</span>
              <div class="flex items-center gap-2">
                <div
                  classList={{
                    "size-2 rounded-full": true,
                    "bg-surface-success-strong": t().enabled,
                    "bg-surface-base-hover": !t().enabled,
                  }}
                />
                <span class="text-14-regular text-text-base">
                  {t().enabled ? "已启用" : "已禁用"}
                </span>
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <span class="text-12-medium text-text-weak">提示词</span>
              <div class="p-2 rounded-md bg-surface-base text-12-regular text-text-base whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                {t().prompt}
              </div>
            </div>

            <Show when={lastRun()}>
              <div class="flex flex-col gap-1">
                <span class="text-12-medium text-text-weak">上次执行</span>
                <div class="flex items-center gap-2">
                  <Show when={t().lastRunStatus === "success"}>
                    <Icon name="check" class="size-4 text-icon-success-base" />
                    <span class="text-14-regular text-text-base">成功</span>
                  </Show>
                  <Show when={t().lastRunStatus === "error"}>
                    <Icon name="close" class="size-4 text-icon-critical-base" />
                    <span class="text-14-regular text-text-base">失败</span>
                  </Show>
                  <Show when={t().lastRunStatus === "running"}>
                    <Icon name="settings-gear" class="size-4 text-icon-info-base animate-spin" />
                    <span class="text-14-regular text-text-base">执行中</span>
                  </Show>
                  <span class="text-12-regular text-text-subtle">
                    {lastRun()!.toFormat("yyyy-MM-dd HH:mm")}
                  </span>
                </div>
                <Show when={t().lastSessionId}>
                  <Button variant="ghost" size="small" class="self-start" onClick={handleViewSession}>
                    查看 Session
                  </Button>
                </Show>
              </div>
            </Show>
          </div>

          <div class="flex gap-2 px-4 pt-2 border-t border-border-weak-base">
            <Button variant="ghost" size="small" onClick={props.onEdit}>
              编辑
            </Button>
            <Button variant="ghost" size="small" onClick={handleToggle}>
              {t().enabled ? "禁用" : "启用"}
            </Button>
            <Button variant="ghost" size="small" onClick={handleRun}>
              立即执行
            </Button>
            <Button variant="ghost" size="small" class="text-text-critical-base" onClick={handleDelete}>
              删除
            </Button>
          </div>
        </div>
      )}
    </Show>
  )
}

import { createMemo, For, Show } from "solid-js"
import { DateTime } from "luxon"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useScheduler, type SchedulerTask } from "@/context/scheduler"
import { getFilename } from "@opencode-ai/util/path"

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
    if (dayOfWeek === "0,6") {
      return `周末 ${hour}:${minute.padStart(2, "0")}`
    }
  }

  if (dayOfMonth !== "*" && month === "*" && dayOfWeek === "*") {
    return `每月 ${dayOfMonth} 日 ${hour}:${minute.padStart(2, "0")}`
  }

  return cron
}

function TaskItem(props: { task: SchedulerTask; onSelect: () => void }) {
  const scheduler = useScheduler()
  const lastRun = createMemo(() =>
    props.task.lastRunAt ? DateTime.fromMillis(props.task.lastRunAt) : null,
  )

  const handleToggle = async (e: Event) => {
    e.stopPropagation()
    await scheduler.updateTask(props.task.id, { enabled: !props.task.enabled })
  }

  const handleRun = async (e: Event) => {
    e.stopPropagation()
    await scheduler.runTask(props.task.id)
  }

  return (
    <div
      class="group/task relative w-full rounded-md cursor-pointer transition-colors hover:bg-surface-raised-base-hover"
      onClick={props.onSelect}
    >
      <div class="flex flex-col gap-1 px-4 py-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <div
              classList={{
                "size-2 rounded-full shrink-0": true,
                "bg-surface-success-strong": props.task.enabled,
                "bg-surface-base-hover": !props.task.enabled,
              }}
            />
            <span class="text-14-medium text-text-strong truncate">{props.task.name}</span>
          </div>
          <div class="flex items-center gap-1 opacity-0 group-hover/task:opacity-100 transition-opacity">
            <Tooltip placement="top" value={props.task.enabled ? "禁用" : "启用"}>
              <IconButton
                icon={props.task.enabled ? "circle-ban-sign" : "circle-check"}
                variant="ghost"
                onClick={handleToggle}
              />
            </Tooltip>
            <Tooltip placement="top" value="立即执行">
              <IconButton icon="chevron-right" variant="ghost" onClick={handleRun} />
            </Tooltip>
          </div>
        </div>
        <div class="flex items-center justify-between gap-2 text-12-regular text-text-weak">
          <span>{cronToHuman(props.task.cron)}</span>
          <Show when={lastRun()}>
            {(lr) => (
              <span class="flex items-center gap-1">
                <Show when={props.task.lastRunStatus === "success"}>
                  <Icon name="check" class="size-3 text-icon-success-base" />
                </Show>
                <Show when={props.task.lastRunStatus === "error"}>
                  <Icon name="close" class="size-3 text-icon-critical-base" />
                </Show>
                <Show when={props.task.lastRunStatus === "running"}>
                  <Icon name="settings-gear" class="size-3 text-icon-info-base animate-spin" />
                </Show>
                {lr().toRelative({ style: "short" })}
              </span>
            )}
          </Show>
        </div>
        <div class="text-12-regular text-text-subtle truncate">{getFilename(props.task.cwd)}</div>
      </div>
    </div>
  )
}

export function TaskList(props: { onCreateTask: () => void }) {
  const scheduler = useScheduler()

  const sortedTasks = createMemo(() =>
    [...scheduler.state.tasks].sort((a, b) => b.createdAt - a.createdAt),
  )

  return (
    <div class="flex flex-col gap-2 w-full">
      <div class="flex items-center justify-between px-2">
        <span class="text-12-medium text-text-weak">定时任务</span>
        <Tooltip placement="top" value="新建任务">
          <IconButton icon="plus-small" variant="ghost" onClick={props.onCreateTask} />
        </Tooltip>
      </div>
      <Show
        when={sortedTasks().length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center gap-2 py-8 text-text-weak">
            <Icon name="checklist" class="size-8 opacity-50" />
            <span class="text-12-regular">暂无定时任务</span>
            <Button variant="ghost" size="small" onClick={props.onCreateTask}>
              创建第一个任务
            </Button>
          </div>
        }
      >
        <nav class="flex flex-col gap-1">
          <For each={sortedTasks()}>
            {(task) => (
              <TaskItem task={task} onSelect={() => scheduler.selectTask(task.id)} />
            )}
          </For>
        </nav>
      </Show>
    </div>
  )
}

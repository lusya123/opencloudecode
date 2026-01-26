import z from "zod"
import { Tool } from "./tool"
import { Scheduler, SchedulerTask } from "../scheduler"
import { Instance } from "../project/instance"

const DESCRIPTION = `管理定时任务。可以创建、更新、删除、列出定时任务。

定时任务允许你设置自动执行的任务，这些任务会在指定的时间自动运行，就像人类对话一样调用完整的 Agent 能力。

当用户的需求是“定时/周期性执行”（例如每天 18:00 自动抓取/同步），优先使用本工具创建任务；除非用户明确要求，否则不要用 bash 去写系统级的 cron/launchd。

注意：Cron 表达式按运行后端进程的本地时区解析（可通过环境变量 TZ 控制）。

## 操作类型

- **list**: 列出所有定时任务
- **get**: 获取单个任务详情
- **create**: 创建新的定时任务
- **update**: 更新现有任务
- **delete**: 删除任务
- **run**: 立即执行任务（不等待计划时间）

## Cron 表达式格式

使用标准的 cron 表达式格式：
- \`30 12 * * *\` - 每天 12:30
- \`0 9 * * 1-5\` - 工作日每天 9:00
- \`0 */2 * * *\` - 每 2 小时
- \`0 0 1 * *\` - 每月 1 号 0:00

## 示例

创建一个每天中午执行的任务：
\`\`\`json
{
  "action": "create",
  "task": {
    "name": "采集抖音数据",
    "cron": "30 12 * * *",
    "cwd": "/path/to/project",
    "prompt": "执行 /douyin-data-collector 采集今日数据",
    "enabled": true
  }
}
\`\`\`
`

export const SchedulerTool = Tool.define("scheduler", {
  description: DESCRIPTION,
  parameters: z.object({
    action: z.enum(["create", "update", "delete", "list", "get", "run"]).describe("操作类型"),
    taskId: z.string().optional().describe("任务 ID（update/delete/get/run 时必填）"),
    task: z
      .object({
        name: z.string().optional().describe("任务名称"),
        cron: z.string().optional().describe("Cron 表达式"),
        cwd: z.string().optional().describe("工作目录"),
        prompt: z.string().optional().describe("执行时输入给 Agent 的提示词"),
        model: z
          .object({
            providerID: z.string(),
            modelID: z.string(),
          })
          .optional()
          .describe("指定使用的模型"),
        enabled: z.boolean().optional().describe("是否启用"),
      })
      .optional()
      .describe("任务配置（create/update 时使用）"),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "scheduler",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    switch (params.action) {
      case "list": {
        const tasks = await SchedulerTask.list()
        return {
          title: `${tasks.length} 个定时任务`,
          output: JSON.stringify(tasks, null, 2),
          metadata: { tasks },
        }
      }

      case "get": {
        if (!params.taskId) {
          throw new Error("获取任务详情需要提供 taskId")
        }
        const task = await SchedulerTask.get(params.taskId)
        if (!task) {
          throw new Error(`任务不存在: ${params.taskId}`)
        }
        return {
          title: `任务: ${task.name}`,
          output: JSON.stringify(task, null, 2),
          metadata: { task },
        }
      }

      case "create": {
        if (!params.task) {
          throw new Error("创建任务需要提供 task 配置")
        }
        if (!params.task.name || !params.task.cron || !params.task.prompt) {
          throw new Error("创建任务需要提供 name、cron 和 prompt")
        }
        const task = await SchedulerTask.create({
          name: params.task.name,
          cron: params.task.cron,
          cwd: params.task.cwd ?? Instance.worktree,
          prompt: params.task.prompt,
          model: params.task.model,
          enabled: params.task.enabled ?? true,
        })
        Scheduler.scheduleTask(task)
        return {
          title: `已创建任务: ${task.name}`,
          output: JSON.stringify(task, null, 2),
          metadata: { task },
        }
      }

      case "update": {
        if (!params.taskId) {
          throw new Error("更新任务需要提供 taskId")
        }
        if (!params.task) {
          throw new Error("更新任务需要提供 task 配置")
        }
        const task = await SchedulerTask.update(params.taskId, params.task)
        Scheduler.scheduleTask(task)
        return {
          title: `已更新任务: ${task.name}`,
          output: JSON.stringify(task, null, 2),
          metadata: { task },
        }
      }

      case "delete": {
        if (!params.taskId) {
          throw new Error("删除任务需要提供 taskId")
        }
        Scheduler.unscheduleTask(params.taskId)
        await SchedulerTask.remove(params.taskId)
        return {
          title: `已删除任务`,
          output: `任务 ${params.taskId} 已删除`,
          metadata: { taskId: params.taskId },
        }
      }

      case "run": {
        if (!params.taskId) {
          throw new Error("执行任务需要提供 taskId")
        }
        const sessionId = await Scheduler.executeTask(params.taskId)
        return {
          title: `任务已开始执行`,
          output: sessionId ? `任务已开始执行，Session ID: ${sessionId}` : "任务执行失败",
          metadata: { sessionId },
        }
      }

      default:
        throw new Error(`未知操作: ${params.action}`)
    }
  },
})

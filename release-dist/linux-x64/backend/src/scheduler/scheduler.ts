import { Cron } from "croner"
import { Log } from "../util/log"
import { SchedulerTask } from "./task"
import { Session } from "../session"
import { SessionPrompt } from "../session/prompt"
import { Instance } from "../project/instance"
import { InstanceBootstrap } from "../project/bootstrap"
import { Identifier } from "../id/id"

export namespace Scheduler {
  const log = Log.create({ service: "scheduler" })

  const jobs = new Map<string, Cron>()
  let initialized = false

  export async function init() {
    if (initialized) return
    initialized = true
    log.info("initializing scheduler")
    await loadTasks()
  }

  export async function stop() {
    log.info("stopping scheduler")
    for (const [id, job] of jobs) {
      job.stop()
      jobs.delete(id)
    }
    initialized = false
  }

  async function loadTasks() {
    const tasks = await SchedulerTask.list()
    for (const task of tasks) {
      if (task.enabled) {
        scheduleTask(task)
      }
    }
  }

  export function scheduleTask(task: SchedulerTask.Info) {
    const existing = jobs.get(task.id)
    if (existing) {
      existing.stop()
      jobs.delete(task.id)
    }

    if (!task.enabled) return

    log.info("scheduling task", { id: task.id, name: task.name, cron: task.cron })

    const job = new Cron(task.cron, async () => {
      log.info("executing scheduled task", { id: task.id, name: task.name })
      await executeTask(task.id)
    })

    jobs.set(task.id, job)
  }

  export function unscheduleTask(taskId: string) {
    const job = jobs.get(taskId)
    if (job) {
      job.stop()
      jobs.delete(taskId)
    }
  }

  export async function executeTask(taskId: string): Promise<string | undefined> {
    const task = await SchedulerTask.get(taskId)
    if (!task) {
      log.error("task not found", { taskId })
      return undefined
    }

    log.info("executing task", { id: task.id, name: task.name, cwd: task.cwd })

    try {
      const sessionId = await Instance.provide({
        directory: task.cwd,
        init: InstanceBootstrap,
        async fn() {
          const session = await Session.createNext({
            directory: task.cwd,
            title: `[定时任务] ${task.name}`,
          })

          await SchedulerTask.markStarted(task.id, session.id)

          const messageID = Identifier.ascending("message")
          const parts = await SessionPrompt.resolvePromptParts(task.prompt)

          await SessionPrompt.prompt({
            sessionID: session.id,
            messageID,
            model: task.model,
            parts,
          })

          await SchedulerTask.markCompleted(task.id, session.id, "success")
          return session.id
        },
      })

      return sessionId
    } catch (error) {
      log.error("task execution failed", { taskId, error })
      const currentTask = await SchedulerTask.get(taskId)
      if (currentTask?.lastSessionId) {
        await SchedulerTask.markCompleted(taskId, currentTask.lastSessionId, "error")
      }
      return undefined
    }
  }

  export function getNextRun(taskId: string): Date | null {
    const job = jobs.get(taskId)
    if (!job) return null
    return job.nextRun()
  }

  export function isRunning(taskId: string): boolean {
    const job = jobs.get(taskId)
    return job?.isRunning() ?? false
  }
}

import z from "zod"
import { Storage } from "../storage/storage"
import { Identifier } from "../id/id"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { GlobalBus } from "@/bus/global"

export namespace SchedulerTask {
  export const Model = z.object({
    providerID: z.string(),
    modelID: z.string(),
  })
  export type Model = z.output<typeof Model>

  export const Info = z.object({
    id: z.string(),
    name: z.string(),
    cron: z.string(),
    cwd: z.string(),
    prompt: z.string(),
    model: Model.optional(),
    enabled: z.boolean(),
    createdAt: z.number(),
    lastRunAt: z.number().optional(),
    lastRunStatus: z.enum(["success", "error", "running"]).optional(),
    lastSessionId: z.string().optional(),
  })
  export type Info = z.output<typeof Info>

  export const CreateInput = Info.omit({ id: true, createdAt: true })
  export type CreateInput = z.input<typeof CreateInput>

  export const UpdateInput = Info.partial().omit({ id: true, createdAt: true })
  export type UpdateInput = z.input<typeof UpdateInput>

  export const Event = {
    Created: BusEvent.define(
      "scheduler.task.created",
      z.object({ task: Info }),
    ),
    Updated: BusEvent.define(
      "scheduler.task.updated",
      z.object({ task: Info }),
    ),
    Deleted: BusEvent.define(
      "scheduler.task.deleted",
      z.object({ taskId: z.string() }),
    ),
    Started: BusEvent.define(
      "scheduler.task.started",
      z.object({ task: Info, sessionId: z.string() }),
    ),
    Completed: BusEvent.define(
      "scheduler.task.completed",
      z.object({ task: Info, sessionId: z.string(), status: z.enum(["success", "error"]) }),
    ),
  }

  const STORAGE_KEY = ["scheduler", "tasks"]

  interface TasksFile {
    tasks: Info[]
  }

  async function readTasks(): Promise<Info[]> {
    try {
      const data = await Storage.read<TasksFile>(STORAGE_KEY)
      return data.tasks ?? []
    } catch (e) {
      if (e instanceof Storage.NotFoundError) {
        return []
      }
      throw e
    }
  }

  async function writeTasks(tasks: Info[]): Promise<void> {
    await Storage.write<TasksFile>(STORAGE_KEY, { tasks })
  }

  export async function list(): Promise<Info[]> {
    return readTasks()
  }

  export async function get(id: string): Promise<Info | undefined> {
    const tasks = await readTasks()
    return tasks.find((t) => t.id === id)
  }

  export async function create(input: CreateInput): Promise<Info> {
    const tasks = await readTasks()
    const task: Info = {
      ...input,
      id: Identifier.ascending("task"),
      createdAt: Date.now(),
    }
    tasks.push(task)
    await writeTasks(tasks)
    Bus.publish(Event.Created, { task })
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Event.Created.type,
        properties: { task },
      },
    })
    return task
  }

  export async function update(id: string, input: UpdateInput): Promise<Info> {
    const tasks = await readTasks()
    const index = tasks.findIndex((t) => t.id === id)
    if (index === -1) {
      throw new Storage.NotFoundError({ message: `Task not found: ${id}` })
    }
    const task = { ...tasks[index], ...input }
    tasks[index] = task
    await writeTasks(tasks)
    Bus.publish(Event.Updated, { task })
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Event.Updated.type,
        properties: { task },
      },
    })
    return task
  }

  export async function remove(id: string): Promise<void> {
    const tasks = await readTasks()
    const index = tasks.findIndex((t) => t.id === id)
    if (index === -1) {
      throw new Storage.NotFoundError({ message: `Task not found: ${id}` })
    }
    tasks.splice(index, 1)
    await writeTasks(tasks)
    Bus.publish(Event.Deleted, { taskId: id })
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Event.Deleted.type,
        properties: { taskId: id },
      },
    })
  }

  export async function markStarted(id: string, sessionId: string): Promise<Info> {
    const task = await update(id, {
      lastRunAt: Date.now(),
      lastRunStatus: "running",
      lastSessionId: sessionId,
    })
    Bus.publish(Event.Started, { task, sessionId })
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Event.Started.type,
        properties: { task, sessionId },
      },
    })
    return task
  }

  export async function markCompleted(id: string, sessionId: string, status: "success" | "error"): Promise<Info> {
    const task = await update(id, {
      lastRunStatus: status,
    })
    Bus.publish(Event.Completed, { task, sessionId, status })
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Event.Completed.type,
        properties: { task, sessionId, status },
      },
    })
    return task
  }
}

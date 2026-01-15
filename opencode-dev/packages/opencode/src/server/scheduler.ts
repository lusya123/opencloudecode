import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import z from "zod"
import { errors } from "./error"
import { Scheduler, SchedulerTask } from "../scheduler"

export const SchedulerRoute = new Hono()
  .get(
    "/tasks",
    describeRoute({
      summary: "List all scheduled tasks",
      description: "Get a list of all scheduled tasks.",
      operationId: "scheduler.tasks.list",
      responses: {
        200: {
          description: "List of scheduled tasks",
          content: {
            "application/json": {
              schema: resolver(SchedulerTask.Info.array()),
            },
          },
        },
      },
    }),
    async (c) => {
      const tasks = await SchedulerTask.list()
      return c.json(tasks)
    },
  )
  .get(
    "/tasks/:taskId",
    describeRoute({
      summary: "Get a scheduled task",
      description: "Get details of a specific scheduled task.",
      operationId: "scheduler.tasks.get",
      responses: {
        200: {
          description: "Scheduled task details",
          content: {
            "application/json": {
              schema: resolver(SchedulerTask.Info),
            },
          },
        },
        ...errors(404),
      },
    }),
    validator("param", z.object({ taskId: z.string() })),
    async (c) => {
      const { taskId } = c.req.valid("param")
      const task = await SchedulerTask.get(taskId)
      if (!task) {
        return c.json({ error: "Task not found" }, 404)
      }
      return c.json(task)
    },
  )
  .post(
    "/tasks",
    describeRoute({
      summary: "Create a scheduled task",
      description: "Create a new scheduled task.",
      operationId: "scheduler.tasks.create",
      responses: {
        200: {
          description: "Created scheduled task",
          content: {
            "application/json": {
              schema: resolver(SchedulerTask.Info),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator("json", SchedulerTask.CreateInput),
    async (c) => {
      const input = c.req.valid("json")
      const task = await SchedulerTask.create(input)
      Scheduler.scheduleTask(task)
      return c.json(task)
    },
  )
  .put(
    "/tasks/:taskId",
    describeRoute({
      summary: "Update a scheduled task",
      description: "Update an existing scheduled task.",
      operationId: "scheduler.tasks.update",
      responses: {
        200: {
          description: "Updated scheduled task",
          content: {
            "application/json": {
              schema: resolver(SchedulerTask.Info),
            },
          },
        },
        ...errors(400, 404),
      },
    }),
    validator("param", z.object({ taskId: z.string() })),
    validator("json", SchedulerTask.UpdateInput),
    async (c) => {
      const { taskId } = c.req.valid("param")
      const input = c.req.valid("json")
      const task = await SchedulerTask.update(taskId, input)
      Scheduler.scheduleTask(task)
      return c.json(task)
    },
  )
  .delete(
    "/tasks/:taskId",
    describeRoute({
      summary: "Delete a scheduled task",
      description: "Delete a scheduled task.",
      operationId: "scheduler.tasks.delete",
      responses: {
        200: {
          description: "Task deleted",
          content: {
            "application/json": {
              schema: resolver(z.boolean()),
            },
          },
        },
        ...errors(404),
      },
    }),
    validator("param", z.object({ taskId: z.string() })),
    async (c) => {
      const { taskId } = c.req.valid("param")
      Scheduler.unscheduleTask(taskId)
      await SchedulerTask.remove(taskId)
      return c.json(true)
    },
  )
  .post(
    "/tasks/:taskId/run",
    describeRoute({
      summary: "Run a scheduled task immediately",
      description: "Execute a scheduled task immediately without waiting for its schedule.",
      operationId: "scheduler.tasks.run",
      responses: {
        200: {
          description: "Task execution started",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  sessionId: z.string().optional(),
                }),
              ),
            },
          },
        },
        ...errors(404),
      },
    }),
    validator("param", z.object({ taskId: z.string() })),
    async (c) => {
      const { taskId } = c.req.valid("param")
      const sessionId = await Scheduler.executeTask(taskId)
      return c.json({ sessionId })
    },
  )
  .get(
    "/tasks/:taskId/next-run",
    describeRoute({
      summary: "Get next run time",
      description: "Get the next scheduled run time for a task.",
      operationId: "scheduler.tasks.nextRun",
      responses: {
        200: {
          description: "Next run time",
          content: {
            "application/json": {
              schema: resolver(
                z.object({
                  nextRun: z.string().nullable(),
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", z.object({ taskId: z.string() })),
    async (c) => {
      const { taskId } = c.req.valid("param")
      const nextRun = Scheduler.getNextRun(taskId)
      return c.json({ nextRun: nextRun?.toISOString() ?? null })
    },
  )

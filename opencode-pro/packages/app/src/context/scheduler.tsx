import { createContext, useContext, ParentProps, onMount, batch } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useGlobalSDK } from "./global-sdk"
import { usePlatform } from "./platform"

export interface SchedulerTaskModel {
  providerID: string
  modelID: string
}

export interface SchedulerTask {
  id: string
  name: string
  cron: string
  cwd: string
  prompt: string
  model?: SchedulerTaskModel
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  lastRunStatus?: "success" | "error" | "running"
  lastSessionId?: string
}

export type CreateTaskInput = Omit<SchedulerTask, "id" | "createdAt">
export type UpdateTaskInput = Partial<Omit<SchedulerTask, "id" | "createdAt">>

interface SchedulerState {
  tasks: SchedulerTask[]
  loading: boolean
  selectedTaskId: string | null
  view: "workspace" | "scheduler"
}

interface SchedulerContextValue {
  state: SchedulerState
  setView: (view: "workspace" | "scheduler") => void
  selectTask: (taskId: string | null) => void
  loadTasks: () => Promise<void>
  createTask: (input: CreateTaskInput) => Promise<SchedulerTask>
  updateTask: (taskId: string, input: UpdateTaskInput) => Promise<SchedulerTask>
  deleteTask: (taskId: string) => Promise<void>
  runTask: (taskId: string) => Promise<string | undefined>
}

const SchedulerContext = createContext<SchedulerContextValue>()

export function SchedulerProvider(props: ParentProps) {
  const globalSDK = useGlobalSDK()
  const platform = usePlatform()

  const [state, setState] = createStore<SchedulerState>({
    tasks: [],
    loading: false,
    selectedTaskId: null,
    view: "workspace",
  })

  const baseUrl = globalSDK.url

  async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
    const fetchFn = platform.fetch ?? fetch
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    })
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    return response.json()
  }

  async function loadTasks() {
    setState("loading", true)
    try {
      const tasks = await fetchApi<SchedulerTask[]>("/scheduler/tasks")
      setState("tasks", reconcile(tasks, { key: "id" }))
    } finally {
      setState("loading", false)
    }
  }

  async function createTask(input: CreateTaskInput): Promise<SchedulerTask> {
    const task = await fetchApi<SchedulerTask>("/scheduler/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    })
    setState("tasks", (tasks) => [...tasks, task])
    return task
  }

  async function updateTask(taskId: string, input: UpdateTaskInput): Promise<SchedulerTask> {
    const task = await fetchApi<SchedulerTask>(`/scheduler/tasks/${taskId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    })
    setState("tasks", (t) => t.id === taskId, task)
    return task
  }

  async function deleteTask(taskId: string): Promise<void> {
    await fetchApi<boolean>(`/scheduler/tasks/${taskId}`, {
      method: "DELETE",
    })
    setState("tasks", (tasks) => tasks.filter((t) => t.id !== taskId))
    if (state.selectedTaskId === taskId) {
      setState("selectedTaskId", null)
    }
  }

  async function runTask(taskId: string): Promise<string | undefined> {
    const result = await fetchApi<{ sessionId?: string }>(`/scheduler/tasks/${taskId}/run`, {
      method: "POST",
    })
    await loadTasks()
    return result.sessionId
  }

  function setView(view: "workspace" | "scheduler") {
    setState("view", view)
  }

  function selectTask(taskId: string | null) {
    setState("selectedTaskId", taskId)
  }

  onMount(() => {
    const unsub = globalSDK.event.listen((e) => {
      if (e.name !== "global") return
      const payload = e.details
      if (payload?.type === "scheduler.task.created") {
        const task = payload.properties?.task as SchedulerTask
        if (task) {
          setState("tasks", (tasks) => [...tasks, task])
        }
      } else if (payload?.type === "scheduler.task.updated") {
        const task = payload.properties?.task as SchedulerTask
        if (task) {
          setState("tasks", (t) => t.id === task.id, task)
        }
      } else if (payload?.type === "scheduler.task.deleted") {
        const taskId = payload.properties?.taskId as string
        if (taskId) {
          setState("tasks", (tasks) => tasks.filter((t) => t.id !== taskId))
        }
      }
    })
    return unsub
  })

  const value: SchedulerContextValue = {
    state,
    setView,
    selectTask,
    loadTasks,
    createTask,
    updateTask,
    deleteTask,
    runTask,
  }

  return <SchedulerContext.Provider value={value}>{props.children}</SchedulerContext.Provider>
}

export function useScheduler() {
  const context = useContext(SchedulerContext)
  if (!context) {
    throw new Error("useScheduler must be used within a SchedulerProvider")
  }
  return context
}

import { createEffect, createMemo, For, Show, batch } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { VList } from "virtua/solid"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { TextField } from "@opencode-ai/ui/text-field"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useGlobalSDK } from "@/context/global-sdk"
import type { FileNode } from "@opencode-ai/sdk/v2"
import { useParams } from "@solidjs/router"
import { base64Decode } from "@opencode-ai/util/encode"

type RootType = "project" | "root"

interface FlatNode {
  node: FileNode
  level: number
  isExpanded: boolean
  isLoading: boolean
  hasError: boolean
  errorMessage?: string
}

interface FileSystemState {
  rootType: RootType
  rootPath: string
  addressInput: string
  expandedPaths: Set<string>
  selectedPaths: Set<string>
  loadingPaths: Set<string>
  children: Record<string, FileNode[]>
  errors: Record<string, string>
}

const VIRTUAL_SCROLL_THRESHOLD = 100

export function FileSystemTab() {
  const globalSDK = useGlobalSDK()
  const params = useParams()

  const systemRoot = "/"

  const [state, setState] = createStore<FileSystemState>({
    rootType: "project",
    rootPath: systemRoot,
    addressInput: systemRoot,
    expandedPaths: new Set(),
    selectedPaths: new Set(),
    loadingPaths: new Set(),
    children: {},
    errors: {},
  })

  const projectRoot = createMemo(() => {
    const slug = params.dir
    if (!slug) return ""
    try {
      return base64Decode(slug)
    } catch {
      return ""
    }
  })

  const currentRoot = createMemo(() => {
    if (state.rootType === "project") return projectRoot()
    return state.rootPath
  })

  const listDirectory = createMemo(() => (state.rootType === "project" ? projectRoot() : systemRoot))

  function normalizePosixPath(input: string) {
    const trimmed = input.trim()
    if (!trimmed) return ""

    const absolute = trimmed.startsWith("/")
    const parts = trimmed.split("/").filter(Boolean)
    const stack: string[] = []

    for (const part of parts) {
      if (part === ".") continue
      if (part === "..") {
        stack.pop()
        continue
      }
      stack.push(part)
    }

    const joined = stack.join("/")
    if (absolute) return "/" + joined
    return joined || "."
  }

  function resolveAddressPath(input: string) {
    const raw = input.trim()
    if (!raw) return ""
    if (raw.startsWith("/")) return normalizePosixPath(raw) || systemRoot
    const base = currentRoot() || systemRoot
    return normalizePosixPath(`${base.replace(/\/+$/, "")}/${raw}`) || systemRoot
  }

  const loadDirectory = async (path: string, opts?: { directory?: string }) => {
    if (state.loadingPaths.has(path)) return
    if (state.children[path]) return
    const directory = opts?.directory ?? listDirectory()
    if (!directory) {
      setState(
        produce((s) => {
          s.errors[path] = "未打开项目，无法读取目录"
        }),
      )
      return
    }

    setState(
      produce((s) => {
        s.loadingPaths.add(path)
        delete s.errors[path]
      }),
    )

    try {
      const response = await globalSDK.client.file.list({
        directory,
        path,
      })
      const items = response.data || []
      const sortedItems = [...items].sort((a, b) => {
        if (a.type === "directory" && b.type !== "directory") return -1
        if (a.type !== "directory" && b.type === "directory") return 1
        return a.name.localeCompare(b.name)
      })

      setState(
        produce((s) => {
          s.children[path] = sortedItems
          s.loadingPaths.delete(path)
        }),
      )
    } catch (e: any) {
      setState(
        produce((s) => {
          s.errors[path] = e.message || "无法访问此目录"
          s.loadingPaths.delete(path)
        }),
      )
    }
  }

  const toggleExpand = (path: string) => {
    const isExpanded = state.expandedPaths.has(path)
    setState(
      produce((s) => {
        if (isExpanded) {
          s.expandedPaths.delete(path)
        } else {
          s.expandedPaths.add(path)
        }
      }),
    )
    if (!isExpanded) {
      loadDirectory(path)
    }
  }

  const toggleSelect = (path: string, event: MouseEvent) => {
    setState(
      produce((s) => {
        if (event.metaKey || event.ctrlKey) {
          if (s.selectedPaths.has(path)) {
            s.selectedPaths.delete(path)
          } else {
            s.selectedPaths.add(path)
          }
        } else {
          s.selectedPaths.clear()
          s.selectedPaths.add(path)
        }
      }),
    )
  }

  const handleDragStart = (e: DragEvent, node: FileNode) => {
    const paths = state.selectedPaths.has(node.absolute)
      ? Array.from(state.selectedPaths)
      : [node.absolute]

    e.dataTransfer!.effectAllowed = "copy"
    e.dataTransfer!.setData("text/plain", `filepath:${paths.join("\n")}`)
    e.dataTransfer!.setData("application/x-file-paths", JSON.stringify(paths))

    const dragImage = document.createElement("div")
    dragImage.className =
      "flex items-center gap-x-2 px-2 py-1 bg-background-element rounded-md border border-border-1"
    dragImage.style.position = "absolute"
    dragImage.style.top = "-1000px"

    const icon = (e.currentTarget as HTMLElement).querySelector("svg")
    const text = (e.currentTarget as HTMLElement).querySelector("span")
    if (icon && text) {
      dragImage.innerHTML = icon.outerHTML + text.outerHTML
    }
    if (paths.length > 1) {
      dragImage.innerHTML += `<span class="text-xs text-text-muted ml-1">+${paths.length - 1}</span>`
    }

    document.body.appendChild(dragImage)
    e.dataTransfer!.setDragImage(dragImage, 0, 12)
    setTimeout(() => document.body.removeChild(dragImage), 0)
  }

  const setRootType = (type: RootType) => {
    const nextRootPath = type === "project" ? projectRoot() : state.rootPath
    const nextDirectory = type === "project" ? projectRoot() : systemRoot

    batch(() => {
      setState("rootType", type)
      setState("expandedPaths", new Set())
      setState("selectedPaths", new Set())
      setState("loadingPaths", new Set())
      setState("children", {})
      setState("errors", {})
    })

    if (nextRootPath) {
      if (type === "root") setState("addressInput", nextRootPath)
      loadDirectory(nextRootPath, { directory: nextDirectory })
    }
  }

  // Flatten the tree for virtual scrolling
  const flattenTree = (path: string, level: number): FlatNode[] => {
    const result: FlatNode[] = []
    const children = state.children[path] || []
    const isLoading = state.loadingPaths.has(path)
    const error = state.errors[path]

    if (isLoading) {
      result.push({
        node: { name: "loading", path: `${path}/__loading__`, absolute: `${path}/__loading__`, type: "file", ignored: false },
        level,
        isExpanded: false,
        isLoading: true,
        hasError: false,
      })
    } else if (error) {
      result.push({
        node: { name: "error", path: `${path}/__error__`, absolute: `${path}/__error__`, type: "file", ignored: false },
        level,
        isExpanded: false,
        isLoading: false,
        hasError: true,
        errorMessage: error,
      })
    } else {
      for (const node of children) {
        const isExpanded = state.expandedPaths.has(node.absolute)
        result.push({
          node,
          level,
          isExpanded,
          isLoading: false,
          hasError: false,
        })

        if (node.type === "directory" && isExpanded) {
          result.push(...flattenTree(node.absolute, level + 1))
        }
      }
    }

    return result
  }

  const flatNodes = createMemo(() => flattenTree(currentRoot(), 0))
  const useVirtualScroll = createMemo(() => flatNodes().length > VIRTUAL_SCROLL_THRESHOLD)

  let lastProjectRoot = ""
  createEffect(() => {
    const root = projectRoot()
    if (!root) return
    if (state.rootType !== "project") return
    if (root !== lastProjectRoot) {
      lastProjectRoot = root
      batch(() => {
        setState("expandedPaths", new Set())
        setState("selectedPaths", new Set())
        setState("loadingPaths", new Set())
        setState("children", {})
        setState("errors", {})
      })
    }
    loadDirectory(root, { directory: root })
  })

  return (
    <div class="w-full min-h-0 flex flex-col overflow-hidden">
      <div class="flex gap-1 px-2 py-1.5 shrink-0 border-b border-border-weak-base">
        <Tooltip value="项目主目录" placement="bottom">
          <Button
            variant="ghost"
            size="small"
            data-active={state.rootType === "project"}
            onClick={() => setRootType("project")}
          >
            <Icon name="folder" size="small" />
          </Button>
        </Tooltip>
        <Tooltip value="根目录（可通过地址栏跳转任意路径）" placement="bottom">
          <Button
            variant="ghost"
            size="small"
            data-active={state.rootType === "root"}
            onClick={() => setRootType("root")}
          >
            <Icon name="server" size="small" />
          </Button>
        </Tooltip>
      </div>

      <Show when={state.rootType === "root"}>
        <div class="px-2 py-1.5 shrink-0 border-b border-border-weak-base">
          <TextField
            value={state.addressInput}
            onChange={(v) => setState("addressInput", v)}
            placeholder="/Users/you/project"
            class="w-full"
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key !== "Enter") return
              const resolved = resolveAddressPath(state.addressInput)
              if (!resolved) return
              batch(() => {
                setState("rootPath", resolved)
                setState("expandedPaths", new Set())
                setState("selectedPaths", new Set())
                setState("loadingPaths", new Set())
                setState("children", {})
                setState("errors", {})
              })
              loadDirectory(resolved, { directory: systemRoot })
            }}
          />
        </div>
      </Show>

      <Show
        when={state.rootType === "project" && !projectRoot()}
        fallback={
          <Show
            when={useVirtualScroll()}
            fallback={
              <div class="flex-1 overflow-y-auto no-scrollbar">
                <For each={flatNodes()}>
                  {(flatNode) => (
                    <FlatFileNode
                      flatNode={flatNode}
                      state={state}
                      onToggleExpand={toggleExpand}
                      onToggleSelect={toggleSelect}
                      onDragStart={handleDragStart}
                    />
                  )}
                </For>
              </div>
            }
          >
            <VList data={flatNodes()} class="flex-1 no-scrollbar" overscan={10}>
              {(flatNode) => (
                <FlatFileNode
                  flatNode={flatNode}
                  state={state}
                  onToggleExpand={toggleExpand}
                  onToggleSelect={toggleSelect}
                  onDragStart={handleDragStart}
                />
              )}
            </VList>
          </Show>
        }
      >
        <div class="flex-1 flex items-center justify-center px-3">
          <div class="text-xs text-text-muted">未打开项目</div>
        </div>
      </Show>
    </div>
  )
}

function FlatFileNode(props: {
  flatNode: FlatNode
  state: FileSystemState
  onToggleExpand: (path: string) => void
  onToggleSelect: (path: string, event: MouseEvent) => void
  onDragStart: (e: DragEvent, node: FileNode) => void
}) {
  const isSelected = createMemo(() => props.state.selectedPaths.has(props.flatNode.node.absolute))

  // Loading state
  if (props.flatNode.isLoading) {
    return (
      <div class="flex items-center gap-2 p-2" style={`padding-left: ${props.flatNode.level * 10 + 8}px`}>
        <Spinner class="w-4 h-4" />
        <span class="text-xs text-text-muted">加载中...</span>
      </div>
    )
  }

  // Error state
  if (props.flatNode.hasError) {
    return (
      <div
        class="flex items-center gap-2 p-2 text-text-error"
        style={`padding-left: ${props.flatNode.level * 10 + 8}px`}
      >
        <Icon name="circle-ban-sign" size="small" />
        <span class="text-xs">{props.flatNode.errorMessage}</span>
      </div>
    )
  }

  const node = props.flatNode.node

  // Directory
  if (node.type === "directory") {
    return (
      <Tooltip forceMount={false} openDelay={2000} value={node.absolute} placement="right">
        <div
          classList={{
            "p-0.5 w-full flex items-center gap-x-2 hover:bg-background-element cursor-pointer": true,
            "bg-background-element": isSelected(),
          }}
          style={`padding-left: ${props.flatNode.level * 10}px`}
          draggable={true}
          onDragStart={(e) => props.onDragStart(e, node)}
          onClick={(e) => {
            props.onToggleSelect(node.absolute, e)
          }}
          onDblClick={() => props.onToggleExpand(node.absolute)}
        >
          <button
            class="p-0.5 hover:bg-background-stronger rounded"
            onClick={(e) => {
              e.stopPropagation()
              props.onToggleExpand(node.absolute)
            }}
          >
            <Icon
              name="chevron-right"
              size="small"
              class="text-text-muted/60 transition-transform"
              style={props.flatNode.isExpanded ? "transform: rotate(90deg)" : ""}
            />
          </button>
          <FileIcon node={node} class="text-text-muted/60 -ml-1" />
          <span
            classList={{
              "text-xs whitespace-nowrap truncate": true,
              "text-text-muted/40": node.ignored,
              "text-text-muted/80": !node.ignored,
            }}
          >
            {node.name}
          </span>
        </div>
      </Tooltip>
    )
  }

  // File
  return (
    <Tooltip forceMount={false} openDelay={2000} value={node.absolute} placement="right">
      <div
        classList={{
          "p-0.5 w-full flex items-center gap-x-2 hover:bg-background-element cursor-pointer": true,
          "bg-background-element": isSelected(),
        }}
        style={`padding-left: ${props.flatNode.level * 10}px`}
        draggable={true}
        onDragStart={(e) => props.onDragStart(e, node)}
        onClick={(e) => props.onToggleSelect(node.absolute, e)}
      >
        <div class="w-5 shrink-0" />
        <FileIcon node={node} class="text-primary" />
        <span
          classList={{
            "text-xs whitespace-nowrap truncate": true,
            "text-text-muted/40": node.ignored,
            "text-text-muted/80": !node.ignored,
          }}
        >
          {node.name}
        </span>
      </div>
    </Tooltip>
  )
}

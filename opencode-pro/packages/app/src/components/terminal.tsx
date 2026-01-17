import type { Ghostty, Terminal as Term, FitAddon } from "ghostty-web"
import { ComponentProps, createEffect, createSignal, onCleanup, onMount, splitProps } from "solid-js"
import { useSDK } from "@/context/sdk"
import { SerializeAddon } from "@/addons/serialize"
import { LocalPTY, useTerminal } from "@/context/terminal"
import { resolveThemeVariant, useTheme, withAlpha, type HexColor } from "@opencode-ai/ui/theme"
import { INSERT_TEXT_EVENT, type InsertPayload } from "@/utils/insert-text"
import {
  encodeXtermMouseWheel,
  getMouseCellFromWheelEvent,
  getMouseProtocol,
  wheelEventToLineDelta,
  wheelEventToSteps,
} from "@/utils/terminal-mouse"

const isTerminalAlternateScreen = (terminal: unknown): boolean => {
  const t = terminal as {
    isAlternateScreen?: unknown
    buffer?: { active?: { type?: unknown } }
  }

  if (typeof t.isAlternateScreen === "function") {
    try {
      return !!(t.isAlternateScreen as () => boolean)()
    } catch {
      return false
    }
  }

  if (typeof t.isAlternateScreen === "boolean") return t.isAlternateScreen

  return t.buffer?.active?.type === "alternate"
}

export interface TerminalProps extends ComponentProps<"div"> {
  pty: LocalPTY
  onSubmit?: () => void
  onCleanup?: (pty: LocalPTY) => void
  onConnectError?: (error: unknown) => void
}

function shellQuotePosix(input: string) {
  if (!input) return "''"
  if (/^[a-zA-Z0-9_./:-]+$/.test(input)) return input
  return `'${input.replace(/'/g, `'\"'\"'`)}'`
}

function parseDroppedPaths(dt: DataTransfer | null): string[] {
  if (!dt) return []

  const jsonPayload = dt.getData("application/x-file-paths")
  if (jsonPayload) {
    try {
      const parsed = JSON.parse(jsonPayload)
      if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean)
    } catch {
      // ignore
    }
  }

  const text = dt.getData("text/plain")?.trim()
  if (text?.startsWith("filepath:")) {
    return text
      .slice("filepath:".length)
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
  }

  const uriList = dt.getData("text/uri-list")?.trim()
  if (uriList) {
    const uris = uriList
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x && !x.startsWith("#"))
    const paths = uris
      .map((u) => {
        if (!u.startsWith("file://")) return undefined
        try {
          return decodeURIComponent(u.slice("file://".length))
        } catch {
          return u.slice("file://".length)
        }
      })
      .filter((x): x is string => Boolean(x))
    if (paths.length) return paths
  }

  return []
}

function canAcceptDrop(dt: DataTransfer | null) {
  if (!dt) return false
  const types = Array.from(dt.types ?? [])
  if (types.includes("application/x-file-paths")) return true
  if (types.includes("text/uri-list")) return true
  if (types.includes("text/plain")) {
    const text = dt.getData("text/plain")?.trim()
    return Boolean(text?.startsWith("filepath:"))
  }
  return false
}

type TerminalColors = {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
}

const DEFAULT_TERMINAL_COLORS: Record<"light" | "dark", TerminalColors> = {
  light: {
    background: "#fcfcfc",
    foreground: "#211e1e",
    cursor: "#211e1e",
    selectionBackground: withAlpha("#211e1e", 0.2),
  },
  dark: {
    background: "#191515",
    foreground: "#d4d4d4",
    cursor: "#d4d4d4",
    selectionBackground: withAlpha("#d4d4d4", 0.25),
  },
}

export const Terminal = (props: TerminalProps) => {
  const sdk = useSDK()
  const theme = useTheme()
  const terminalContext = useTerminal()
  let container!: HTMLDivElement
  const [local, others] = splitProps(props, ["pty", "class", "classList", "onConnectError"])
  let ws: WebSocket | undefined
  let term: Term | undefined
  let ghostty: Ghostty
  let serializeAddon: SerializeAddon
  let fitAddon: FitAddon
  let handleResize: () => void
  let handleTextareaFocus: () => void
  let handleTextareaBlur: () => void
  let handleDragOver: (e: globalThis.DragEvent) => void
  let handleDrop: (e: globalThis.DragEvent) => void
  let handleInsertText: ((e: Event) => void) | undefined
  let reconnect: number | undefined
  let disposed = false

  const getTerminalColors = (): TerminalColors => {
    const mode = theme.mode()
    const fallback = DEFAULT_TERMINAL_COLORS[mode]
    const currentTheme = theme.themes()[theme.themeId()]
    if (!currentTheme) return fallback
    const variant = mode === "dark" ? currentTheme.dark : currentTheme.light
    if (!variant?.seeds) return fallback
    const resolved = resolveThemeVariant(variant, mode === "dark")
    const text = resolved["text-stronger"] ?? fallback.foreground
    const background = resolved["background-stronger"] ?? fallback.background
    const alpha = mode === "dark" ? 0.25 : 0.2
    const base = text.startsWith("#") ? (text as HexColor) : (fallback.foreground as HexColor)
    const selectionBackground = withAlpha(base, alpha)
    return {
      background,
      foreground: text,
      cursor: text,
      selectionBackground,
    }
  }

  const [terminalColors, setTerminalColors] = createSignal<TerminalColors>(getTerminalColors())

  createEffect(() => {
    const colors = getTerminalColors()
    setTerminalColors(colors)
    if (!term) return
    const setOption = (term as unknown as { setOption?: (key: string, value: TerminalColors) => void }).setOption
    if (!setOption) return
    setOption("theme", colors)
  })

  const focusTerminal = () => {
    const t = term
    if (!t) return
    t.focus()
    setTimeout(() => t.textarea?.focus(), 0)
  }
  const handlePointerDown = () => {
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && activeElement !== container) {
      activeElement.blur()
    }
    focusTerminal()
  }

	  onMount(async () => {
    const mod = await import("ghostty-web")
    ghostty = await mod.Ghostty.load()

    const url = new URL(sdk.url)
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
    url.pathname = url.pathname.replace(/\/?$/, "/") + `pty/${local.pty.id}/connect`
    url.searchParams.set("directory", sdk.directory)
    if (window.__OPENCODE__?.serverPassword) {
      url.username = "opencode"
      url.password = window.__OPENCODE__?.serverPassword
    }
    const socket = new WebSocket(url)
    ws = socket

    const t = new mod.Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 14,
      fontFamily: "IBM Plex Mono, monospace",
      allowTransparency: true,
      theme: terminalColors(),
      scrollback: 10_000,
      ghostty,
    })
    term = t

    const copy = () => {
      const selection = t.getSelection()
      if (!selection) return false

      const body = document.body
      if (body) {
        const textarea = document.createElement("textarea")
        textarea.value = selection
        textarea.setAttribute("readonly", "")
        textarea.style.position = "fixed"
        textarea.style.opacity = "0"
        body.appendChild(textarea)
        textarea.select()
        const copied = document.execCommand("copy")
        body.removeChild(textarea)
        if (copied) return true
      }

      const clipboard = navigator.clipboard
      if (clipboard?.writeText) {
        clipboard.writeText(selection).catch(() => {})
        return true
      }

      return false
    }

    t.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase()

      if (event.ctrlKey && event.shiftKey && !event.metaKey && key === "c") {
        copy()
        return true
      }

      if (event.metaKey && !event.ctrlKey && !event.altKey && key === "c") {
        if (!t.hasSelection()) return true
        copy()
        return true
      }

      // allow for ctrl-` to toggle terminal in parent
      if (event.ctrlKey && key === "`") {
        return true
      }

      return false
    })

  // ghostty-web's default alternate-screen wheel behavior emits up/down arrow keys, which can make TUIs (e.g. Claude/Cloud Code)
  // "twitch" on trackpad scrolling. Prefer real xterm mouse-wheel reporting when the app enables mouse tracking.
  t.attachCustomWheelEventHandler((event) => {
      if (!isTerminalAlternateScreen(t)) return false

      const metrics = t.renderer?.getMetrics?.()
      const lineHeight = typeof metrics?.height === "number" && metrics.height > 0 ? metrics.height : 20
      const delta = wheelEventToLineDelta(event, { lineHeight, rows: t.rows })
      if (!delta) return true

      if (t.hasMouseTracking()) {
        const socket = ws
        if (socket?.readyState === WebSocket.OPEN) {
          const { col, row } = getMouseCellFromWheelEvent(t, event)
          const protocol = getMouseProtocol((mode, isAnsi) => t.getMode(mode, isAnsi))
          const direction = event.deltaY > 0 ? "down" : "up"
          const steps = wheelEventToSteps(event, { lineHeight, rows: t.rows })
          for (let i = 0; i < steps; i++) {
            socket.send(
              encodeXtermMouseWheel({
                protocol,
                direction,
                col,
                row,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
              }),
            )
          }
          return true
        }
      }

      // Fallback: avoid injecting arrow keys; try to scroll the viewport instead.
      t.scrollToLine(t.getViewportY() - delta)
      return true
    })

    fitAddon = new mod.FitAddon()
    serializeAddon = new SerializeAddon()
    t.loadAddon(serializeAddon)
    t.loadAddon(fitAddon)

	    t.open(container)
	    container.addEventListener("pointerdown", handlePointerDown)

	    handleDragOver = (e) => {
	      if (!canAcceptDrop(e.dataTransfer)) return
	      e.preventDefault()
	      e.dataTransfer!.dropEffect = "copy"
	    }
	    handleDrop = (e) => {
	      const paths = parseDroppedPaths(e.dataTransfer)
	      if (paths.length === 0) return
	      e.preventDefault()
	      e.stopPropagation()

	      const socket = ws
	      if (!socket || socket.readyState !== WebSocket.OPEN) return
	      socket.send(paths.map(shellQuotePosix).join(" ") + " ")
	      focusTerminal()
	    }
	    container.addEventListener("dragover", handleDragOver, true)
	    container.addEventListener("drop", handleDrop, true)

      handleInsertText = (event) => {
        const payload = (event as CustomEvent<InsertPayload>).detail
        if (!payload) return
        if (payload.target !== "terminal") return
        if (terminalContext.active() !== local.pty.id) return

        const socket = ws
        if (!socket || socket.readyState !== WebSocket.OPEN) return

        const text =
          payload.text ??
          (payload.paths && payload.paths.length > 0 ? payload.paths.map(shellQuotePosix).join(" ") + " " : "")
        if (!text) return

        socket.send(text)
        focusTerminal()
      }
      document.addEventListener(INSERT_TEXT_EVENT, handleInsertText)

	    handleTextareaFocus = () => {
	      t.options.cursorBlink = true
	    }
	    handleTextareaBlur = () => {
      t.options.cursorBlink = false
    }

    t.textarea?.addEventListener("focus", handleTextareaFocus)
    t.textarea?.addEventListener("blur", handleTextareaBlur)

    focusTerminal()

    if (local.pty.buffer) {
      if (local.pty.rows && local.pty.cols) {
        t.resize(local.pty.cols, local.pty.rows)
      }
      t.write(local.pty.buffer, () => {
        if (local.pty.scrollY) {
          t.scrollToLine(local.pty.scrollY)
        }
        fitAddon.fit()
      })
    }

    fitAddon.observeResize()
    handleResize = () => fitAddon.fit()
    window.addEventListener("resize", handleResize)
    t.onResize(async (size) => {
      if (socket.readyState === WebSocket.OPEN) {
        await sdk.client.pty
          .update({
            ptyID: local.pty.id,
            size: {
              cols: size.cols,
              rows: size.rows,
            },
          })
          .catch(() => {})
      }
    })
    t.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data)
      }
    })
    t.onKey((key) => {
      if (key.key == "Enter") {
        props.onSubmit?.()
      }
    })
    // t.onScroll((ydisp) => {
    // console.log("Scroll position:", ydisp)
    // })
    socket.addEventListener("open", () => {
      console.log("WebSocket connected")
      sdk.client.pty
        .update({
          ptyID: local.pty.id,
          size: {
            cols: t.cols,
            rows: t.rows,
          },
        })
        .catch(() => {})
    })
    socket.addEventListener("message", (event) => {
      t.write(event.data)
    })
    socket.addEventListener("error", (error) => {
      console.error("WebSocket error:", error)
      props.onConnectError?.(error)
    })
    socket.addEventListener("close", () => {
      console.log("WebSocket disconnected")
    })
  })

	  onCleanup(() => {
	    if (handleResize) {
	      window.removeEventListener("resize", handleResize)
	    }
	    container.removeEventListener("pointerdown", handlePointerDown)
	    if (handleDragOver) container.removeEventListener("dragover", handleDragOver, true)
	    if (handleDrop) container.removeEventListener("drop", handleDrop, true)
      if (handleInsertText) document.removeEventListener(INSERT_TEXT_EVENT, handleInsertText)
	    term?.textarea?.removeEventListener("focus", handleTextareaFocus)
	    term?.textarea?.removeEventListener("blur", handleTextareaBlur)

	    const t = term
    if (serializeAddon && props.onCleanup && t) {
      const buffer = serializeAddon.serialize()
      props.onCleanup({
        ...local.pty,
        buffer,
        rows: t.rows,
        cols: t.cols,
        scrollY: t.getViewportY(),
      })
    }

    ws?.close()
    t?.dispose()
  })

  return (
    <div
      ref={container}
      data-component="terminal"
      data-prevent-autofocus
      style={{ "background-color": terminalColors().background }}
      classList={{
        ...(local.classList ?? {}),
        "select-text": true,
        "size-full px-6 py-3 font-mono": true,
        [local.class ?? ""]: !!local.class,
      }}
      {...others}
    />
  )
}

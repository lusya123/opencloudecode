export type MouseProtocol = "sgr" | "urxvt" | "x10"

export function getMouseProtocol(getMode: (mode: number, isAnsi?: boolean) => boolean): MouseProtocol {
  if (getMode(1006)) return "sgr"
  if (getMode(1015)) return "urxvt"
  return "x10"
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function getMouseCellFromWheelEvent(
  term: {
    cols: number
    rows: number
    renderer?: { getCanvas: () => HTMLCanvasElement; getMetrics?: () => any; charWidth?: number; charHeight?: number }
  },
  event: WheelEvent,
) {
  const canvas = term.renderer?.getCanvas?.()
  if (!canvas) {
    return { col: clampInt(Math.floor(term.cols / 2) + 1, 1, term.cols), row: clampInt(Math.floor(term.rows / 2) + 1, 1, term.rows) }
  }
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const metrics = term.renderer?.getMetrics?.()
  const cellWidth =
    typeof metrics?.width === "number" && metrics.width > 0
      ? metrics.width
      : typeof term.renderer?.charWidth === "number" && term.renderer.charWidth > 0
        ? term.renderer.charWidth
        : rect.width / term.cols
  const cellHeight =
    typeof metrics?.height === "number" && metrics.height > 0
      ? metrics.height
      : typeof term.renderer?.charHeight === "number" && term.renderer.charHeight > 0
        ? term.renderer.charHeight
        : rect.height / term.rows

  const col = clampInt(Math.floor(x / cellWidth) + 1, 1, term.cols)
  const row = clampInt(Math.floor(y / cellHeight) + 1, 1, term.rows)

  return { col, row }
}

export function wheelEventToLineDelta(
  event: Pick<WheelEvent, "deltaMode" | "deltaY">,
  options: { lineHeight: number; rows: number },
) {
  if (!event.deltaY) return 0
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) return event.deltaY / options.lineHeight
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * options.rows
  return event.deltaY / 33
}

export function wheelEventToSteps(event: Pick<WheelEvent, "deltaMode" | "deltaY">, options: { lineHeight: number; rows: number }) {
  const delta = wheelEventToLineDelta(event, options)
  if (!delta) return 0
  return clampInt(Math.max(1, Math.round(Math.abs(delta))), 1, 5)
}

export function encodeXtermMouseWheel(opts: {
  protocol: MouseProtocol
  direction: "up" | "down"
  col: number
  row: number
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}) {
  const modifierBits = (opts.shiftKey ? 4 : 0) | (opts.altKey || opts.metaKey ? 8 : 0) | (opts.ctrlKey ? 16 : 0)
  const base = opts.direction === "up" ? 64 : 65
  const cb = base | modifierBits

  if (opts.protocol === "sgr") return `\x1b[<${cb};${opts.col};${opts.row}M`
  if (opts.protocol === "urxvt") return `\x1b[${cb + 32};${opts.col};${opts.row}M`

  const col = clampInt(opts.col, 1, 223)
  const row = clampInt(opts.row, 1, 223)
  return `\x1b[M${String.fromCharCode(32 + cb, 32 + col, 32 + row)}`
}

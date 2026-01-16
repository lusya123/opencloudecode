import { splitProps, type JSX } from "solid-js"

export interface ResizeHandleProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "onResize"> {
  direction: "horizontal" | "vertical"
  size: number
  min: number
  max: number
  onResize: (size: number) => void
  onCollapse?: () => void
  collapseThreshold?: number
}

export function ResizeHandle(props: ResizeHandleProps) {
  const [local, rest] = splitProps(props, [
    "direction",
    "size",
    "min",
    "max",
    "onResize",
    "onCollapse",
    "collapseThreshold",
    "class",
    "classList",
  ])

  const handlePointerDown: JSX.EventHandlerUnion<HTMLDivElement, PointerEvent> = (e) => {
    // Ignore non-primary mouse buttons (but allow touch/stylus).
    if (e.pointerType === "mouse" && e.button !== 0) return

    e.preventDefault()

    const start = local.direction === "horizontal" ? e.clientX : e.clientY
    const startSize = local.size
    let current = startSize

    const prevUserSelect = document.body.style.userSelect
    const prevOverflow = document.body.style.overflow
    document.body.style.userSelect = "none"
    document.body.style.overflow = "hidden"

    const pointerId = e.pointerId
    const target = e.currentTarget as HTMLDivElement
    target.setPointerCapture?.(pointerId)

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const pos = local.direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY
      const delta = local.direction === "vertical" ? start - pos : pos - start
      current = startSize + delta
      const clamped = Math.min(local.max, Math.max(local.min, current))
      local.onResize(clamped)
    }

    const finish = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== pointerId) return
      document.body.style.userSelect = prevUserSelect
      document.body.style.overflow = prevOverflow
      document.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("pointerup", finish)
      document.removeEventListener("pointercancel", finish)

      const threshold = local.collapseThreshold ?? 0
      if (local.onCollapse && threshold > 0 && current < threshold) {
        local.onCollapse()
      }
    }

    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("pointerup", finish)
    document.addEventListener("pointercancel", finish)
  }

  return (
    <div
      {...rest}
      data-component="resize-handle"
      data-direction={local.direction}
      classList={{
        ...(local.classList ?? {}),
        [local.class ?? ""]: !!local.class,
      }}
      onPointerDown={handlePointerDown}
    />
  )
}

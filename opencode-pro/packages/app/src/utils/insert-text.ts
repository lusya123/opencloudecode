export type InsertTarget = "prompt" | "terminal"

export type InsertPayload = {
  target?: InsertTarget
  text?: string
  paths?: string[]
}

export const INSERT_TEXT_EVENT = "opencode:insert-text"

export function dispatchInsertText(payload: InsertPayload) {
  document.dispatchEvent(new CustomEvent<InsertPayload>(INSERT_TEXT_EVENT, { detail: payload }))
}


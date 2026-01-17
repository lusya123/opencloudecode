import { describe, expect, test } from "bun:test"
import { encodeXtermMouseWheel, getMouseProtocol } from "./terminal-mouse"

describe("terminal-mouse", () => {
  test("getMouseProtocol prefers SGR over urxvt", () => {
    expect(getMouseProtocol((mode) => mode === 1006)).toBe("sgr")
    expect(getMouseProtocol((mode) => mode === 1015)).toBe("urxvt")
    expect(getMouseProtocol(() => false)).toBe("x10")
  })

  test("encodeXtermMouseWheel encodes SGR wheel events", () => {
    const seq = encodeXtermMouseWheel({ protocol: "sgr", direction: "up", col: 10, row: 5 })
    expect(seq).toBe("\x1b[<64;10;5M")
  })

  test("encodeXtermMouseWheel includes modifier bits", () => {
    const seq = encodeXtermMouseWheel({
      protocol: "sgr",
      direction: "down",
      col: 1,
      row: 1,
      shiftKey: true,
      altKey: true,
      ctrlKey: true,
    })
    expect(seq).toBe("\x1b[<93;1;1M")
  })

  test("encodeXtermMouseWheel encodes urxvt wheel events", () => {
    const seq = encodeXtermMouseWheel({ protocol: "urxvt", direction: "down", col: 3, row: 4 })
    expect(seq).toBe("\x1b[97;3;4M")
  })

  test("encodeXtermMouseWheel encodes X10 wheel events", () => {
    const seq = encodeXtermMouseWheel({ protocol: "x10", direction: "up", col: 10, row: 5 })
    const codes = Array.from(seq).map((c) => c.charCodeAt(0))
    expect(seq.startsWith("\x1b[M")).toBe(true)
    expect(codes.slice(0, 3)).toEqual([27, 91, 77])
    expect(codes.slice(3)).toEqual([32 + 64, 32 + 10, 32 + 5])
  })
})


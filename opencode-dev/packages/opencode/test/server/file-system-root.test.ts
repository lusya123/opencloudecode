import { describe, expect, test } from "bun:test"
import { Server } from "../../src/server/server"

describe("GET /file (system root)", () => {
  test("lists system root when directory is filesystem root", async () => {
    const res = await Server.App().fetch(new Request("http://localhost:4096/api/file?directory=%2F&path=%2F"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    expect(typeof body[0]?.absolute).toBe("string")
  })
})

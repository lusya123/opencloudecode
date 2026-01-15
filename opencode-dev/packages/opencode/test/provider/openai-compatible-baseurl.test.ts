import { describe, expect, test } from "bun:test"
import { normalizeOpenAICompatibleBaseURL } from "../../src/provider/openai-compatible-baseurl"

describe("provider.normalizeOpenAICompatibleBaseURL", () => {
  test("returns undefined for non-string/empty inputs", () => {
    expect(normalizeOpenAICompatibleBaseURL(undefined)).toBeUndefined()
    expect(normalizeOpenAICompatibleBaseURL(null)).toBeUndefined()
    expect(normalizeOpenAICompatibleBaseURL("   ")).toBeUndefined()
  })

  test("appends /v1 when URL has no path", () => {
    expect(normalizeOpenAICompatibleBaseURL("https://example.com")).toBe("https://example.com/v1")
    expect(normalizeOpenAICompatibleBaseURL("https://example.com/")).toBe("https://example.com/v1")
  })

  test("keeps existing non-root paths", () => {
    expect(normalizeOpenAICompatibleBaseURL("https://example.com/v1")).toBe("https://example.com/v1")
    expect(normalizeOpenAICompatibleBaseURL("https://example.com/openai/v1")).toBe("https://example.com/openai/v1")
  })

  test("passes through invalid URLs (validation happens elsewhere)", () => {
    expect(normalizeOpenAICompatibleBaseURL("not a url")).toBe("not a url")
  })
})


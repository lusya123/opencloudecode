import { describe, expect, test } from "bun:test"
import { getModelDisplayName } from "./model-display"

describe("getModelDisplayName", () => {
  test("adds provider name when model name duplicates across providers", () => {
    const allModels = [
      { name: "gpt-4o", provider: { id: "openai", name: "OpenAI" } },
      { name: "gpt-4o", provider: { id: "openrouter", name: "OpenRouter" } },
    ]

    expect(getModelDisplayName(allModels[0]!, allModels)).toBe("gpt-4o (OpenAI)")
    expect(getModelDisplayName(allModels[1]!, allModels)).toBe("gpt-4o (OpenRouter)")
  })

  test("keeps plain name when unique", () => {
    const allModels = [{ name: "claude-3-5-sonnet", provider: { id: "anthropic", name: "Anthropic" } }]
    expect(getModelDisplayName(allModels[0]!, allModels)).toBe("claude-3-5-sonnet")
  })
})


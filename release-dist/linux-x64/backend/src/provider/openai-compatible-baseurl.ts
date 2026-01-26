export function normalizeOpenAICompatibleBaseURL(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined
  const raw = input.trim()
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/v1"
      return url.toString()
    }
    return raw
  } catch {
    return raw
  }
}


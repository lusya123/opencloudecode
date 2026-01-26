import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"
import { spawn, spawnSync, ChildProcess } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

// CC Switch 子进程管理
let ccSwitchProcess: ChildProcess | null = null

type CCSwitchMode = "dev" | "prod"

function normalizeCCSwitchMode(input: unknown): CCSwitchMode {
  if (input === "prod" || input === "production") return "prod"
  return "dev"
}

function isExecutable(filePath: string) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function findRepoRoot(startDir: string) {
  let dir = startDir
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, "cc-switch-main", "src-tauri", "Cargo.toml"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function resolveBundledCCSwitchServerPath(repoRoot: string) {
  const exe = process.platform === "win32" ? "cc-switch-server.exe" : "cc-switch-server"
  const candidates = [
    path.join(repoRoot, "bin", exe),
    path.join(repoRoot, "cc-switch-main", "src-tauri", "target", "release", exe),
    path.join(repoRoot, "cc-switch-main", "src-tauri", "target", "debug", exe),
  ]
  return candidates.find(isExecutable) ?? null
}

function tryBuildCCSwitchServer(repoRoot: string) {
  if (process.env.CC_SWITCH_AUTO_BUILD === "false") return null
  const tauriDir = path.join(repoRoot, "cc-switch-main", "src-tauri")
  const cargoToml = path.join(tauriDir, "Cargo.toml")
  if (!fs.existsSync(cargoToml)) return null

  console.log(
    "[CC Switch] cc-switch-server not found; building from source (cargo build --release --bin cc-switch-server)...",
  )
  const result = spawnSync("cargo", ["build", "--release", "--bin", "cc-switch-server"], {
    cwd: tauriDir,
    stdio: "inherit",
  })
  if (result.status !== 0) return null
  return resolveBundledCCSwitchServerPath(repoRoot)
}

function supportsConfigDirFlag(serverPath: string) {
  try {
    const result = spawnSync(serverPath, ["--help"], { encoding: "utf8" })
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
    return output.includes("--config-dir")
  } catch {
    return false
  }
}

async function startCCSwitchServer(mode: CCSwitchMode): Promise<ChildProcess | null> {
  const enabled = process.env.CC_SWITCH_ENABLED !== "false"
  if (!enabled) {
    console.log("[CC Switch] Disabled via CC_SWITCH_ENABLED=false")
    return null
  }

  let serverPath = process.env.CC_SWITCH_SERVER_PATH || "cc-switch-server"
  const port = process.env.CC_SWITCH_PORT || "8766"
  let usingLocalRepoBinary = false

  const repoRoot = !process.env.CC_SWITCH_SERVER_PATH ? findRepoRoot(process.cwd()) : null

  if (!process.env.CC_SWITCH_SERVER_PATH) {
    if (repoRoot) {
      const localPath = resolveBundledCCSwitchServerPath(repoRoot) ?? tryBuildCCSwitchServer(repoRoot)
      if (localPath) {
        serverPath = localPath
        usingLocalRepoBinary = true
      }
    }
  }

  console.log(`[CC Switch] Starting server on port ${port}...`)

  const args = ["--port", port]
  const shouldShareConfig = process.env.CC_SWITCH_SHARE_CONFIG === "true" || mode === "prod"
  if (!shouldShareConfig) {
    const configDir = process.env.CC_SWITCH_CONFIG_DIR || path.join(os.homedir(), ".cc-switch-opencode-dev")
    const canPassFlag = (usingLocalRepoBinary || !!process.env.CC_SWITCH_CONFIG_DIR) && supportsConfigDirFlag(serverPath)
    if (canPassFlag) {
      args.push("--config-dir", configDir)
    } else {
      console.log(
        "[CC Switch] Dev mode requested but cc-switch-server does not support --config-dir; falling back to shared ~/.cc-switch",
      )
    }
  }

  const child = spawn(serverPath, args, {
    stdio: "inherit",
    detached: false,
  })

  child.on("error", (err) => {
    console.error(`[CC Switch] Failed to start: ${err.message}`)
    console.log("[CC Switch] Make sure cc-switch-server is installed and in PATH")
    if (repoRoot) {
      const tauriDir = path.join(repoRoot, "cc-switch-main", "src-tauri")
      const exe = process.platform === "win32" ? "cc-switch-server.exe" : "cc-switch-server"
      const builtPath = path.join(tauriDir, "target", "release", exe)
      console.log(`[CC Switch] Local build: (cd ${tauriDir} && cargo build --release --bin cc-switch-server)`)
      console.log(`[CC Switch] Then set CC_SWITCH_SERVER_PATH=${builtPath}`)
    }
  })

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.log(`[CC Switch] Server exited with code ${code}`)
    }
    ccSwitchProcess = null
  })

  return child
}

async function gracefulShutdown(exitCode = 0) {
  // 1. 先关闭 CC Switch 子进程
  if (ccSwitchProcess) {
    console.log("[CC Switch] Stopping server...")
    ccSwitchProcess.kill("SIGTERM")

    // 等待子进程退出，最多等待 5 秒
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.log("[CC Switch] Force killing server...")
        ccSwitchProcess?.kill("SIGKILL")
        resolve()
      }, 5000)

      ccSwitchProcess?.on("exit", () => {
        clearTimeout(timeout)
        console.log("[CC Switch] Server stopped")
        resolve()
      })
    })

    ccSwitchProcess = null
  }

  // 2. 子进程关闭后，主进程才退出
  console.log("[OpenCode-dev] Shutdown complete")
  process.exit(exitCode)
}

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) =>
    withNetworkOptions(yargs).option("mode", {
      type: "string",
      default: process.env.CC_SWITCH_MODE ?? "dev",
      choices: ["dev", "debug", "prod", "production"] as const,
      describe: "cc-switch mode: dev/debug uses isolated DB; prod/production uses default ~/.cc-switch",
    }),
  describe: "starts a headless opencode server",
  handler: async (args) => {
    if (!Flag.OPENCODE_SERVER_PASSWORD) {
      console.log("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }

    // 启动 CC Switch 服务
    const mode = normalizeCCSwitchMode((args as unknown as { mode?: unknown }).mode ?? process.env.CC_SWITCH_MODE)
    ccSwitchProcess = await startCCSwitchServer(mode)

    // 设置信号处理
    process.on("SIGINT", async () => {
      console.log("[OpenCode-dev] Received SIGINT, shutting down...")
      await gracefulShutdown()
    })

    process.on("SIGTERM", async () => {
      console.log("[OpenCode-dev] Received SIGTERM, shutting down...")
      await gracefulShutdown()
    })

    const opts = await resolveNetworkOptions(args)
    let server: ReturnType<typeof Server.listen> | undefined
    try {
      server = Server.listen(opts)
    } catch (error) {
      console.error(
        "[OpenCode-dev] Failed to start server",
        error instanceof Error ? error.message : error,
      )
      await gracefulShutdown(1)
      return
    }

    console.log(`opencode server listening on http://${server.hostname}:${server.port}/api`)
    await new Promise(() => {})
    await server.stop()
  },
})

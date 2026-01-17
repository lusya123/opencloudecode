import { Plugin } from "../plugin"
import { Share } from "../share/share"
import { Format } from "../format"
import { LSP } from "../lsp"
import { FileWatcher } from "../file/watcher"
import { File } from "../file"
import { Project } from "./project"
import { Bus } from "../bus"
import { Command } from "../command"
import { Instance } from "./instance"
import { Vcs } from "./vcs"
import { Log } from "@/util/log"
import { ShareNext } from "@/share/share-next"
import path from "path"

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })

  // System root instances are used for the "system directory" browser.
  // Bootstrapping the full stack (plugins/LSP/watchers/etc.) at filesystem root is expensive
  // and can fail/hang on some machines, which makes directory listing unusable.
  const isFilesystemRoot = Instance.directory === path.parse(Instance.directory).root
  if (isFilesystemRoot) {
    File.init()
    return
  }

  await Plugin.init()
  Share.init()
  ShareNext.init()
  Format.init()
  await LSP.init()
  FileWatcher.init()
  File.init()
  Vcs.init()

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      await Project.setInitialized(Instance.project.id)
    }
  })
}

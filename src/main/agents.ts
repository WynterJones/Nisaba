import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { homedir } from 'os'
import { join } from 'path'
import { access } from 'fs/promises'
import { constants } from 'fs'

const run = promisify(execFile)

export type AgentInstallation = {
  id: 'claude' | 'codex'
  label: string
  path: string | null
  version: string | null
}

/** Login shells aren't guaranteed here, so check the usual install locations directly. */
const SEARCH_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  join(homedir(), '.local/bin'),
  join(homedir(), '.bun/bin'),
  join(homedir(), '.nvm/versions/node')
]

async function locate(binary: string): Promise<string | null> {
  try {
    const { stdout } = await run('/usr/bin/which', [binary], {
      env: { ...process.env, PATH: `${SEARCH_PATHS.join(':')}:${process.env.PATH ?? ''}` }
    })
    const found = stdout.trim()
    if (found) return found
  } catch {
    /* not on PATH — fall through to the explicit locations */
  }

  for (const dir of SEARCH_PATHS) {
    const candidate = join(dir, binary)
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}

async function detect(id: AgentInstallation['id'], label: string): Promise<AgentInstallation> {
  const path = await locate(id)
  let version: string | null = null
  if (path) {
    try {
      const { stdout } = await run(path, ['--version'], { timeout: 5000 })
      version = stdout.trim().split('\n')[0].slice(0, 40)
    } catch {
      /* present but unresponsive to --version; still usable */
    }
  }
  return { id, label, path, version }
}

export function registerAgentIpc(): void {
  ipcMain.handle('agents:detect', async (): Promise<AgentInstallation[]> => [
    await detect('claude', 'Claude Code CLI'),
    await detect('codex', 'Codex CLI')
  ])
}

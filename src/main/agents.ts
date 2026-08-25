import { ipcMain } from 'electron'
import { AGENTS, AGENT_IDS, type AgentId } from '../shared/agents'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { homedir } from 'os'
import { join } from 'path'
import { access } from 'fs/promises'
import { constants } from 'fs'

const run = promisify(execFile)

export * from '../shared/agents'

export type AgentInstallation = {
  id: AgentId
  label: string
  path: string | null
  version: string | null
}

/** Login shells aren't guaranteed here, so check the usual install locations directly. */
export const SEARCH_PATHS = [
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

async function detect(id: AgentId): Promise<AgentInstallation> {
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
  return { id, label: AGENTS[id].label, path, version }
}

export async function detectAgents(): Promise<AgentInstallation[]> {
  return Promise.all(AGENT_IDS.map(detect))
}

export function registerAgentIpc(): void {
  ipcMain.handle('agents:detect', detectAgents)
}

import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { access, readdir } from 'fs/promises'
import { constants } from 'fs'
import { dirname, join, resolve, relative, isAbsolute } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { addRecord, newId, patchRecord, readIndex, type WorkspaceRecord } from './library'

export type WorkspaceProbe = {
  exists: boolean
  writable: boolean
  packageManager: string | null
  framework: string | null
  entries: number
}

/** Nothing a job does may land outside its workspace root. */
export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

const run = promisify(execFile)

const LOOPBACK = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/

/** Nearest ancestor that looks like a checkout, so a dev server started in `apps/web` still
 *  reports the repo the agent should work in. */
async function projectRoot(from: string): Promise<string> {
  let at = resolve(from)
  for (let i = 0; i < 6; i++) {
    const files = await readdir(at).catch(() => [] as string[])
    if (files.includes('.git') || files.includes('package.json')) return at
    const up = dirname(at)
    if (up === at) break
    at = up
  }
  return resolve(from)
}

/**
 * The folder a localhost page is actually served from, taken from the working directory of
 * the process listening on its port. An audit of a dev server can then name the repository
 * instead of leaving the agent to guess which one it is. Returns null for anything remote,
 * or when nothing is listening we can see.
 */
export async function serverRoot(url: string): Promise<string | null> {
  let port = ''
  try {
    const parsed = new URL(url)
    if (!LOOPBACK.test(parsed.hostname)) return null
    port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
  } catch {
    return null
  }

  const lsof = (args: string[]): Promise<string> =>
    // A GUI launch inherits a bare PATH; lsof lives in /usr/sbin on macOS.
    run('lsof', args, {
      timeout: 5000,
      env: { ...process.env, PATH: `${process.env.PATH ?? ''}:/usr/sbin:/usr/bin` }
    }).then(
      (r) => r.stdout,
      () => ''
    )

  const pid = (await lsof(['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])).trim().split('\n')[0]
  if (!pid) return null

  // -Fn prints one field per line, each prefixed by its tag; the cwd is the `n` line.
  const cwd = (await lsof(['-a', '-p', pid, '-d', 'cwd', '-Fn']))
    .split('\n')
    .find((line) => line.startsWith('n') && line.length > 1)
    ?.slice(1)
  if (!cwd) return null

  const probe = await probeWorkspace(cwd)
  return probe.exists && probe.writable ? projectRoot(cwd) : null
}

export async function probeWorkspace(root: string): Promise<WorkspaceProbe> {
  const probe: WorkspaceProbe = {
    exists: false,
    writable: false,
    packageManager: null,
    framework: null,
    entries: 0
  }
  try {
    await access(root, constants.R_OK)
    probe.exists = true
    await access(root, constants.W_OK)
    probe.writable = true
  } catch {
    return probe
  }

  const files = await readdir(root).catch(() => [] as string[])
  probe.entries = files.length

  const has = (name: string): boolean => files.includes(name)
  if (has('pnpm-lock.yaml')) probe.packageManager = 'pnpm'
  else if (has('yarn.lock')) probe.packageManager = 'yarn'
  else if (has('bun.lockb') || has('bun.lock')) probe.packageManager = 'bun'
  else if (has('package-lock.json')) probe.packageManager = 'npm'

  if (has('next.config.js') || has('next.config.mjs') || has('next.config.ts')) probe.framework = 'Next.js'
  else if (has('astro.config.mjs')) probe.framework = 'Astro'
  else if (has('vite.config.ts') || has('vite.config.js')) probe.framework = 'Vite'
  else if (has('Gemfile')) probe.framework = 'Rails'
  else if (has('package.json')) probe.framework = 'Node'

  return probe
}

/**
 * A workspace root is a write boundary, so it is re-checked on every change — not only when
 * the workspace is first created.
 */
async function assertUsableRoot(root: string, exceptId?: string): Promise<void> {
  const probe = await probeWorkspace(root)
  if (!probe.exists) throw new Error('That folder does not exist')
  if (!probe.writable) throw new Error('Nisaba cannot write to that folder')

  const index = await readIndex()
  if (index.workspaces.some((w) => w.id !== exceptId && resolve(w.root) === resolve(root))) {
    throw new Error('That folder is already a workspace')
  }
}

export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspaces:pick', async (e): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose a workspace folder',
      message: 'Agent jobs may only write inside the folder you choose.',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('workspaces:probe', (_e, root: string) => probeWorkspace(root))

  ipcMain.handle('workspaces:serverRoot', (_e, url: string) => serverRoot(url))

  ipcMain.handle(
    'workspaces:create',
    async (_e, input: Omit<WorkspaceRecord, 'id' | 'createdAt'>): Promise<WorkspaceRecord> => {
      await assertUsableRoot(input.root)
      return addRecord('workspaces', { ...input, id: newId(), createdAt: Date.now() })
    }
  )

  ipcMain.handle(
    'workspaces:update',
    async (_e, id: string, patch: Partial<Omit<WorkspaceRecord, 'id' | 'createdAt'>>) => {
      if (patch.root) await assertUsableRoot(patch.root, id)
      await patchRecord('workspaces', id, patch)
    }
  )

  ipcMain.handle('workspaces:reveal', (_e, root: string) => shell.openPath(join(root)))
}

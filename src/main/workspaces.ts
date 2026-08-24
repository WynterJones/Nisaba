import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { access, readdir } from 'fs/promises'
import { constants } from 'fs'
import { join, resolve, relative, isAbsolute } from 'path'
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

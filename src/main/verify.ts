import { ipcMain, BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { SEARCH_PATHS } from './agents'

export type Check = {
  label: string
  command: string
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
  output: string
  ms: number
}

export type PreviewState = {
  running: boolean
  url: string | null
  command: string | null
  log: string
}

const previews = new Map<string, ChildProcess>()
const previewState = new Map<string, PreviewState>()

/** Reads package.json scripts and proposes the checks a project actually has. */
export async function suggestChecks(root: string): Promise<Check[]> {
  const raw = await readFile(join(root, 'package.json'), 'utf8').catch(() => null)
  if (!raw) return []

  let scripts: Record<string, string> = {}
  try {
    scripts = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts ?? {}
  } catch {
    return []
  }

  const runner = 'npm run'
  const wanted: [string, string[]][] = [
    ['Lint', ['lint', 'eslint']],
    ['Types', ['typecheck', 'type-check', 'tsc']],
    ['Tests', ['test', 'test:unit']],
    ['Build', ['build']]
  ]

  const checks: Check[] = []
  for (const [label, names] of wanted) {
    const script = names.find((n) => scripts[n])
    if (script) checks.push({ label, command: `${runner} ${script}`, status: 'pending', output: '', ms: 0 })
  }
  return checks
}

/** Best guess at the dev-server script for a project. */
export async function suggestPreview(root: string): Promise<string | null> {
  const raw = await readFile(join(root, 'package.json'), 'utf8').catch(() => null)
  if (!raw) return null
  try {
    const scripts = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts ?? {}
    for (const name of ['dev', 'start', 'serve', 'preview']) {
      if (scripts[name]) return `npm run ${name}`
    }
  } catch {
    /* not a package.json we understand */
  }
  return null
}

function run(
  command: string,
  cwd: string,
  onData: (chunk: string) => void,
  extraEnv: Record<string, string> = {}
): { child: ChildProcess; done: Promise<number | null> } {
  // Commands come from the user's own package.json or their own typing, and run in their
  // workspace — the shell is the point, not a hazard being introduced here.
  const child = spawn(command, {
    cwd,
    shell: true,
    env: {
      ...process.env,
      // A packaged app inherits launchd's PATH, where node and npm do not exist. Same fix as
      // the PTY module: prepend the places these tools are actually installed.
      PATH: `${SEARCH_PATHS.join(':')}:${process.env.PATH ?? ''}`,
      FORCE_COLOR: '0',
      ...extraEnv
    }
  })
  child.stdout?.on('data', (c: Buffer) => onData(c.toString()))
  child.stderr?.on('data', (c: Buffer) => onData(c.toString()))
  // A shell that cannot even start is still a close; without this the promise never settles.
  child.on('error', (error) => onData(`\n${error.message}\n`))
  const done = new Promise<number | null>((resolve) => child.on('close', resolve))
  return { child, done }
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

export function registerVerifyIpc(): void {
  ipcMain.handle('verify:suggest', (_e, root: string) => suggestChecks(root))
  ipcMain.handle('preview:suggest', (_e, root: string) => suggestPreview(root))

  /** Runs each check in order and stops at the first failure. */
  ipcMain.handle(
    'verify:run',
    async (_e, input: { root: string; checks: Check[]; componentId: string }): Promise<Check[]> => {
      const results: Check[] = input.checks.map((c) => ({ ...c, status: 'pending', output: '', ms: 0 }))

      for (const [i, check] of results.entries()) {
        check.status = 'running'
        broadcast('verify:progress', { componentId: input.componentId, checks: results })

        const started = Date.now()
        const { done } = run(
          check.command,
          input.root,
          (chunk) => {
            check.output = (check.output + chunk).slice(-20000)
            broadcast('verify:progress', { componentId: input.componentId, checks: results })
          },
          { CI: '1' }
        )
        const code = await done
        check.ms = Date.now() - started
        check.status = code === 0 ? 'passed' : 'failed'
        broadcast('verify:progress', { componentId: input.componentId, checks: results })

        if (check.status === 'failed') {
          // A failing lint makes the build result meaningless; don't pretend otherwise.
          for (const later of results.slice(i + 1)) later.status = 'skipped'
          break
        }
      }

      return results
    }
  )

  /** Starts the workspace's dev server and reports the URL it prints. */
  ipcMain.handle(
    'preview:start',
    async (_e, input: { workspaceId: string; root: string; command: string }): Promise<PreviewState> => {
      // Only a server that actually announced a URL is worth reusing — one still flailing
      // would hand the caller the same empty state forever.
      const existing = previewState.get(input.workspaceId)
      if (existing?.running && existing.url) return existing
      if (existing?.running) previews.get(input.workspaceId)?.kill('SIGTERM')

      const state: PreviewState = { running: true, url: null, command: input.command, log: '' }
      previewState.set(input.workspaceId, state)

      const { child } = run(input.command, input.root, (chunk) => {
        state.log = (state.log + chunk).slice(-20000)
        if (!state.url) {
          const match = state.log.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+[^\s"']*/)
          if (match) state.url = match[0].replace(/[.,)]+$/, '')
        }
        broadcast('preview:state', { workspaceId: input.workspaceId, state })
      })

      previews.set(input.workspaceId, child)
      child.on('close', () => {
        state.running = false
        previews.delete(input.workspaceId)
        broadcast('preview:state', { workspaceId: input.workspaceId, state })
      })

      // Give the server a chance to announce itself before handing control back.
      const deadline = Date.now() + 60000
      while (!state.url && state.running && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
      return state
    }
  )

  ipcMain.handle('preview:stop', (_e, workspaceId: string) => {
    previews.get(workspaceId)?.kill('SIGTERM')
    previews.delete(workspaceId)
    const state = previewState.get(workspaceId)
    if (state) state.running = false
  })

  ipcMain.handle('preview:state', (_e, workspaceId: string) => previewState.get(workspaceId) ?? null)
}

/** Kills any dev server we started, so quitting doesn't leave ports held. */
export function stopAllPreviews(): void {
  for (const child of previews.values()) child.kill('SIGTERM')
  previews.clear()
}

import { BrowserWindow, ipcMain } from 'electron'
import { spawn as ptySpawn, type IPty } from 'node-pty'
import { homedir } from 'os'
import { SEARCH_PATHS } from './agents'
import { newId } from './library'

export type TerminalSummary = {
  id: string
  title: string
  cwd: string
  command: string
  /** Set when this terminal is a background worker rather than a shell the user opened. */
  jobId: string | null
  startedAt: number
  exitCode: number | null
}

type Session = TerminalSummary & { pty: IPty | null; scrollback: string }

/** Enough to redraw a full-screen TUI plus recent history when a panel re-attaches. */
const SCROLLBACK_LIMIT = 250_000

const sessions = new Map<string, Session>()

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function summarise(session: Session): TerminalSummary {
  const { pty: _pty, scrollback: _scrollback, ...rest } = session
  return rest
}

/**
 * A packaged app inherits launchd's PATH, not a login shell's, so `claude` and `codex` are
 * invisible to a bare spawn. The same locations agent detection searches are prepended here.
 */
function ptyEnv(extra?: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') base[key] = value
  }
  return {
    ...base,
    ...extra,
    PATH: `${SEARCH_PATHS.join(':')}:${process.env.PATH ?? ''}`,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    // Agent CLIs render boxes and spinners; without this some of them fall back to ASCII.
    LANG: process.env.LANG ?? 'en_US.UTF-8'
  }
}

export type OpenSpec = {
  title: string
  cwd: string
  file: string
  args?: string[]
  env?: Record<string, string>
  jobId?: string | null
  /** Shown in the UI instead of the raw argv, which may embed a whole prompt. */
  display?: string
  cols?: number
  rows?: number
  onData?: (chunk: string) => void
  onExit?: (exitCode: number, signal?: number) => void
}

/**
 * Starts a process on a real PTY and registers it as a terminal the renderer can attach to.
 * Callers that care about the outcome pass `onExit`; the UI never needs to.
 */
export function openTerminal(spec: OpenSpec): TerminalSummary {
  const id = newId()
  const args = spec.args ?? []
  const session: Session = {
    id,
    title: spec.title,
    cwd: spec.cwd,
    command: spec.display ?? [spec.file, ...args].join(' '),
    jobId: spec.jobId ?? null,
    startedAt: Date.now(),
    exitCode: null,
    pty: null,
    scrollback: ''
  }
  sessions.set(id, session)

  const append = (chunk: string): void => {
    session.scrollback = (session.scrollback + chunk).slice(-SCROLLBACK_LIMIT)
    broadcast('terminal:data', { id, data: chunk })
    spec.onData?.(chunk)
  }

  const finish = (exitCode: number, signal?: number): void => {
    if (session.exitCode !== null) return
    session.exitCode = exitCode
    session.pty = null
    broadcast('terminal:exit', { id, exitCode })
    spec.onExit?.(exitCode, signal)
  }

  try {
    const pty = ptySpawn(spec.file, args, {
      name: 'xterm-256color',
      cwd: spec.cwd,
      env: ptyEnv(spec.env),
      cols: spec.cols ?? 100,
      rows: spec.rows ?? 30
    })
    session.pty = pty
    pty.onData(append)
    pty.onExit(({ exitCode, signal }) => finish(exitCode, signal))
  } catch (error) {
    // A missing binary throws here rather than exiting; report it in the terminal itself.
    const message = error instanceof Error ? error.message : String(error)
    append(`\r\n\x1b[31mCould not start ${spec.file}: ${message}\x1b[0m\r\n`)
    queueMicrotask(() => finish(127))
  }

  broadcast('terminal:opened', summarise(session))
  return summarise(session)
}

export function writeTerminal(id: string, data: string): void {
  sessions.get(id)?.pty?.write(data)
}

export function killTerminal(id: string, signal = 'SIGTERM'): void {
  const session = sessions.get(id)
  if (!session?.pty) return
  try {
    session.pty.kill(signal)
  } catch {
    /* already gone */
  }
}

/** Kills the process if it is still alive and forgets the session entirely. */
export function closeTerminal(id: string): void {
  killTerminal(id, 'SIGKILL')
  sessions.delete(id)
  broadcast('terminal:closed', { id })
}

export function terminalForJob(jobId: string): TerminalSummary | null {
  for (const session of sessions.values()) {
    if (session.jobId === jobId) return summarise(session)
  }
  return null
}

export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:list', () => [...sessions.values()].map(summarise))

  /** A plain login shell, for poking around the workspace without leaving the app. */
  ipcMain.handle('terminal:shell', (_e, cwd?: string) =>
    openTerminal({
      title: 'Shell',
      cwd: cwd || homedir(),
      file: process.env.SHELL || '/bin/zsh',
      args: ['-l'],
      display: `${process.env.SHELL || '/bin/zsh'} -l`
    })
  )

  /** Replays the scrollback so a re-mounted panel shows the session as it stands. */
  ipcMain.handle('terminal:attach', (_e, id: string) => {
    const session = sessions.get(id)
    if (!session) return null
    return { summary: summarise(session), scrollback: session.scrollback }
  })

  ipcMain.handle('terminal:input', (_e, id: string, data: string) => writeTerminal(id, data))

  ipcMain.handle('terminal:resize', (_e, id: string, cols: number, rows: number) => {
    const pty = sessions.get(id)?.pty
    if (!pty || cols < 2 || rows < 2) return
    try {
      pty.resize(Math.floor(cols), Math.floor(rows))
    } catch {
      /* the process exited between the measure and the resize */
    }
  })

  ipcMain.handle('terminal:kill', (_e, id: string) => killTerminal(id))
  ipcMain.handle('terminal:close', (_e, id: string) => closeTerminal(id))
}

/** Nothing should outlive the window that was watching it. */
export function killAllTerminals(): void {
  for (const id of [...sessions.keys()]) closeTerminal(id)
}

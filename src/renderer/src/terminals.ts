import { create } from 'zustand'
import type { TerminalSummary } from '../../preload'

type TerminalState = {
  sessions: TerminalSummary[]
  activeId: string | null
  open: boolean
  /** Panel height in px — dragged by the grip on the tab strip. */
  height: number

  load: () => Promise<void>
  show: (id?: string) => void
  hide: () => void
  toggle: () => void
  setHeight: (height: number) => void
  /** Opens a plain login shell in the given folder and focuses it. */
  newShell: (cwd?: string) => Promise<void>
  close: (id: string) => Promise<void>
}

export const useTerminals = create<TerminalState>((set, get) => ({
  sessions: [],
  activeId: null,
  open: false,
  height: 320,

  load: async () => {
    const sessions = await window.api.terminal.list()
    set((s) => ({
      sessions,
      activeId: sessions.some((t) => t.id === s.activeId)
        ? s.activeId
        : (sessions[sessions.length - 1]?.id ?? null)
    }))
  },

  show: (id) =>
    set((s) => ({ open: true, activeId: id ?? s.activeId ?? s.sessions[0]?.id ?? null })),
  hide: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
  setHeight: (height) => set({ height: Math.min(Math.max(height, 140), 900) }),

  newShell: async (cwd) => {
    const session = await window.api.terminal.shell(cwd)
    set({ open: true, activeId: session.id })
  },

  close: async (id) => {
    await window.api.terminal.close(id)
    const remaining = get().sessions.filter((t) => t.id !== id)
    set({
      sessions: remaining,
      activeId: get().activeId === id ? (remaining[remaining.length - 1]?.id ?? null) : get().activeId
    })
  }
}))

/**
 * One subscription for the whole app, installed once by the dock. Session lifecycle is the
 * only thing tracked here — the bytes go straight to the xterm instance that owns them.
 */
export function watchTerminals(): () => void {
  const { load } = useTerminals.getState()
  void load()

  const offOpened = window.api.terminal.onOpened((summary) =>
    useTerminals.setState((s) => ({
      sessions: s.sessions.some((t) => t.id === summary.id) ? s.sessions : [...s.sessions, summary],
      // A worker that starts on its own should not steal the panel the user is reading.
      activeId: s.activeId ?? summary.id,
      open: s.open || s.sessions.length === 0
    }))
  )

  const offExit = window.api.terminal.onExit(({ id, exitCode }) =>
    useTerminals.setState((s) => ({
      sessions: s.sessions.map((t) => (t.id === id ? { ...t, exitCode } : t))
    }))
  )

  const offClosed = window.api.terminal.onClosed(({ id }) =>
    useTerminals.setState((s) => ({
      sessions: s.sessions.filter((t) => t.id !== id),
      activeId: s.activeId === id ? (s.sessions.filter((t) => t.id !== id)[0]?.id ?? null) : s.activeId
    }))
  )

  return () => {
    offOpened()
    offExit()
    offClosed()
  }
}

/** The terminal a background job is running on, if it is still around. */
export function useJobTerminal(jobId: string | undefined): TerminalSummary | undefined {
  return useTerminals((s) => s.sessions.find((t) => jobId && t.jobId === jobId))
}

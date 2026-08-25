import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { openInApp } from '@/actions'

/** Matches the app palette so a terminal does not read as a foreign window. */
const THEME = {
  background: '#08080a',
  foreground: '#d6d3dc',
  cursor: '#a06bf0',
  cursorAccent: '#08080a',
  selectionBackground: 'rgba(121,40,219,0.35)',
  black: '#1a1a1f',
  red: '#f2778a',
  green: '#5bd6a0',
  yellow: '#e6c384',
  blue: '#7aa2f7',
  magenta: '#c68bf5',
  cyan: '#6fd0d6',
  white: '#d6d3dc',
  brightBlack: '#5a5a66',
  brightRed: '#ff92a3',
  brightGreen: '#78e8b8',
  brightYellow: '#f5da9c',
  brightBlue: '#96b8ff',
  brightMagenta: '#d9a8ff',
  brightCyan: '#8ee6eb',
  brightWhite: '#f2f0f5'
}

/**
 * One xterm bound to one PTY session. Kept mounted (and merely hidden) while the dock is
 * open, because xterm cannot lay out in a zero-sized container and would re-measure wrong.
 */
export function TerminalView({
  sessionId,
  visible
}: {
  sessionId: string
  visible: boolean
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return

    const terminal = new Terminal({
      theme: THEME,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      // The PTY already emits CRLF; converting again double-spaces every agent line.
      convertEol: false,
      allowProposedApi: true
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon((_e, uri) => void openInApp(uri)))
    terminal.open(el)
    term.current = terminal
    fit.current = fitAddon

    let disposed = false
    const push = (chunk: string): void => {
      if (!disposed) terminal.write(chunk)
    }

    const sync = (): void => {
      if (disposed || el.clientWidth === 0 || el.clientHeight === 0) return
      try {
        fitAddon.fit()
      } catch {
        return /* container was mid-layout */
      }
      void window.api.terminal.resize(sessionId, terminal.cols, terminal.rows)
    }

    // Replay first, then take the live feed. Anything that lands in between is buffered here
    // so it is not written ahead of the scrollback it belongs after.
    const pending: string[] = []
    let replayed = false
    const offData = window.api.terminal.onData(({ id, data }) => {
      if (id !== sessionId) return
      if (replayed) push(data)
      else pending.push(data)
    })

    void window.api.terminal.attach(sessionId).then((attached) => {
      if (disposed) return
      if (attached?.scrollback) terminal.write(attached.scrollback)
      replayed = true
      for (const chunk of pending.splice(0)) push(chunk)
      sync()
    })

    const onInput = terminal.onData((data) => void window.api.terminal.input(sessionId, data))

    // Coalesced: a drag on the dock grip fires this dozens of times a second, and every one
    // of them would be a SIGWINCH the agent has to redraw for.
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(sync, 80)
    })
    observer.observe(el)

    return () => {
      disposed = true
      clearTimeout(timer)
      observer.disconnect()
      offData()
      onInput.dispose()
      terminal.dispose()
      term.current = null
      fit.current = null
    }
  }, [sessionId])

  // Becoming visible changes nothing about the element's box, so nothing re-measures on its
  // own — but the session may have been resized by a sibling while this one was hidden.
  useEffect(() => {
    if (!visible || !term.current || !fit.current) return
    const id = setTimeout(() => {
      try {
        fit.current?.fit()
      } catch {
        return
      }
      if (term.current) {
        void window.api.terminal.resize(sessionId, term.current.cols, term.current.rows)
      }
      term.current?.focus()
    }, 30)
    return () => clearTimeout(id)
  }, [visible, sessionId])

  return (
    <div
      ref={host}
      className="absolute inset-0 px-2 py-1"
      style={{ visibility: visible ? 'visible' : 'hidden', zIndex: visible ? 1 : 0 }}
    />
  )
}

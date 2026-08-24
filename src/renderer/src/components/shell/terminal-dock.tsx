import { useEffect } from 'react'
import { ChevronDown, Plus, SquareTerminal, X } from 'lucide-react'
import { TerminalView } from '@/components/shell/terminal-view'
import { useTerminals, watchTerminals } from '@/terminals'
import { useLibrary } from '@/store'
import { cn } from '@/lib/utils'

/**
 * A bottom dock of live PTYs — background workers and shells the user opened. It sits in the
 * flex column above the Tasks bar, so the browser viewport shrinks around it rather than
 * being painted over: a native WebContentsView always wins that fight.
 */
export function TerminalDock(): React.JSX.Element | null {
  const { sessions, activeId, open, height, show, hide, setHeight, newShell, close } =
    useTerminals()
  const workspaces = useLibrary((s) => s.workspaces)

  useEffect(() => watchTerminals(), [])

  if (sessions.length === 0) return null

  const running = sessions.filter((t) => t.exitCode === null).length

  const startResize = (e: React.MouseEvent): void => {
    if (!open) return
    const startY = e.clientY
    const startHeight = height
    const onMove = (move: MouseEvent): void => setHeight(startHeight + (startY - move.clientY))
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="relative z-20 shrink-0 border-t border-border bg-[#08080a]">
      <div
        onMouseDown={startResize}
        className={cn(
          'flex h-9 items-center gap-1 border-b border-border bg-sidebar px-2',
          open && 'cursor-row-resize'
        )}
      >
        <SquareTerminal className="size-3.5 shrink-0 text-brand-bright" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => show(session.id)}
              title={`${session.command} — ${session.cwd}`}
              className={cn(
                'group flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-xs transition-colors',
                open && session.id === activeId
                  ? 'bg-brand/15 text-brand-bright ring-1 ring-inset ring-brand/40'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  session.exitCode === null
                    ? 'animate-pulse bg-emerald-400'
                    : session.exitCode === 0
                      ? 'bg-muted-foreground'
                      : 'bg-destructive'
                )}
              />
              <span className="max-w-[160px] truncate">{session.title}</span>
              <span
                role="button"
                tabIndex={-1}
                aria-label="Close terminal"
                onClick={(e) => {
                  e.stopPropagation()
                  void close(session.id)
                }}
                className="grid size-3.5 place-items-center rounded opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
              >
                <X className="size-2.5" />
              </span>
            </button>
          ))}
        </div>

        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => void newShell(workspaces[0]?.root)}
          title="New shell in your workspace"
          className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => (open ? hide() : show())}
          title={open ? 'Collapse terminals' : `Show terminals (${running} running)`}
          className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {!open && running > 0 && (
            <span className="grid size-4 place-items-center rounded bg-brand text-[10px] font-bold text-primary-foreground">
              {running}
            </span>
          )}
          <ChevronDown className={cn('size-3.5 transition-transform', !open && 'rotate-180')} />
        </button>
      </div>

      {/* Every session stays mounted while the dock is open — xterm cannot lay out in a
          zero-sized box, so inactive panes are hidden rather than unmounted. */}
      {open && (
        <div className="relative" style={{ height }}>
          {sessions.map((session) => (
            <TerminalView
              key={session.id}
              sessionId={session.id}
              visible={session.id === activeId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { Compass, MousePointerClick, X } from 'lucide-react'
import { cancelExtract } from '@/actions'
import { Backdrop } from '@/components/canvas/backdrop'
import { BrowserToolbar } from '@/components/shell/browser-toolbar'
import { Inspector } from '@/components/shell/inspector'
import { AuditPanel } from '@/components/shell/audit-panel'
import { useAudit } from '@/audit'
import { useActiveTab, useApp } from '@/store'
import { cn } from '@/lib/utils'

/**
 * Hosts the native WebContentsView. Remote pages are composited by the main process on top of
 * this element, so its rect — not its children — is what the user actually sees here.
 */
function ViewportHost(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const hasTab = useApp((s) => s.activeTabId !== null)
  const width = useApp((s) => s.viewportWidth)
  const shot = useApp((s) => s.overlayShot)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let last = ''
    let frame = 0
    const push = (): void => {
      const { x, y, width, height } = el.getBoundingClientRect()
      // Every setBounds relays out the remote page, so an unfiltered ResizeObserver — one that
      // fires on every frame of a panel drag, often with identical numbers — makes the page
      // being browsed stutter. Coalesce to one call per frame, and skip no-op moves.
      const key = `${Math.round(x)},${Math.round(y)},${Math.round(width)},${Math.round(height)}`
      if (key === last) return
      last = key
      void window.api.browser.setBounds({ x, y, width, height })
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(push)
    }

    push()
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [])

  // Leaving Browse must hide the native views, or they paint over the library routes.
  useEffect(() => {
    useApp.getState().setViewportMounted(true)
    return () => {
      useApp.getState().setViewportMounted(false)
      // Leaving the route: a library page is about to cover this, so skip the still.
      void window.api.browser.hideAll(false)
    }
  }, [])
  useEffect(() => {
    const { activeTabId } = useApp.getState()
    if (activeTabId) void window.api.browser.activate(activeTabId)
  }, [hasTab])

  // Narrowing this element is the whole device mode: the ResizeObserver above already pushes
  // the new rect to the native view, and the page relays out as a real browser would.
  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-secondary/30">
      <div
        ref={ref}
        style={width ? { width, maxWidth: '100%' } : undefined}
        className={cn(
          'relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background',
          width && 'flex-none border-x border-border'
        )}
      >
        {/* The native view is hidden while UI covers it; this still keeps the page in sight. */}
        {shot && (
          <div className="absolute inset-0">
            <img src={shot} alt="" className="size-full object-cover object-top" />
          </div>
        )}
      </div>
    </div>
  )
}

function StartPage(): React.JSX.Element {
  return (
    <Backdrop>
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="grid size-14 place-items-center rounded-2xl border border-border bg-secondary/50">
          <Compass className="size-6 text-brand-bright" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Browse. Capture. Compound.</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Type a site in the address bar above. Everything you capture keeps its screenshot,
          source and provenance, so your library gets more useful the longer you use it.
        </p>
      </div>
    </Backdrop>
  )
}

export default function Browse(): React.JSX.Element {
  const hasTab = useApp((s) => s.tabs.length > 0)
  const picking = useApp((s) => s.picking)
  const inspectorOpen = useApp((s) => s.inspectorOpen)
  const reviewing = useAudit((s) => s.active || (s.draft?.pins.length ?? 0) > 0)
  const tab = useActiveTab()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BrowserToolbar />
      {picking && (
        <div className="flex shrink-0 items-center gap-2 border-b border-brand/40 bg-brand/10 px-4 py-1.5 text-sm text-brand-bright">
          <MousePointerClick className="size-4 animate-pulse" />
          <span>Click a region of the page to extract it.</span>
          <span className="text-brand-bright/60">
            ↑ parent · ↓ child · ←→ siblings · Esc cancels
          </span>
          <button
            onClick={() => void cancelExtract()}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-brand/20"
          >
            <X className="size-3" />
            Cancel
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {hasTab ? <ViewportHost /> : <StartPage />}
        {reviewing ? <AuditPanel /> : inspectorOpen && <Inspector />}
      </div>
      {tab?.error && (
        <div className="shrink-0 border-t border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Could not load this page — {tab.error}
        </div>
      )}
    </div>
  )
}

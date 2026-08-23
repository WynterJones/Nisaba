import { useEffect, useRef } from 'react'
import { ArrowUpRight, Compass, MousePointerClick, X } from 'lucide-react'
import { cancelExtract } from '@/actions'
import { BrowserToolbar, toUrl } from '@/components/shell/browser-toolbar'
import { Inspector } from '@/components/shell/inspector'
import { useActiveTab, useApp } from '@/store'
import { Button } from '@/components/ui/button'

const SUGGESTIONS = ['linear.app', 'stripe.com', 'vercel.com', 'ui.shadcn.com', 'railway.com']

/**
 * Hosts the native WebContentsView. Remote pages are composited by the main process on top of
 * this element, so its rect — not its children — is what the user actually sees here.
 */
function ViewportHost(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const hasTab = useApp((s) => s.activeTabId !== null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const push = (): void => {
      const { x, y, width, height } = el.getBoundingClientRect()
      void window.api.browser.setBounds({ x, y, width, height })
    }
    push()
    const observer = new ResizeObserver(push)
    observer.observe(el)
    window.addEventListener('resize', push)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', push)
    }
  }, [])

  // Leaving Browse must hide the native views, or they paint over the library routes.
  useEffect(() => () => void window.api.browser.hideAll(), [])
  useEffect(() => {
    const { activeTabId } = useApp.getState()
    if (activeTabId) void window.api.browser.activate(activeTabId)
  }, [hasTab])

  return <div ref={ref} className="min-h-0 flex-1 bg-background" />
}

function StartPage(): React.JSX.Element {
  const newTab = useApp((s) => s.newTab)

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 bg-background p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-2xl border border-border bg-secondary/50">
          <Compass className="size-6 text-brand-bright" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Browse. Capture. Compound.</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Open a site to research. Everything you capture keeps its screenshot, source and
          provenance, so your library gets more useful the longer you use it.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((site) => (
          <Button key={site} variant="secondary" size="sm" onClick={() => newTab(toUrl(site))}>
            {site}
            <ArrowUpRight className="size-3.5 opacity-60" />
          </Button>
        ))}
      </div>
    </div>
  )
}

export default function Browse(): React.JSX.Element {
  const hasTab = useApp((s) => s.tabs.length > 0)
  const picking = useApp((s) => s.picking)
  const inspectorOpen = useApp((s) => s.inspectorOpen)
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
        {inspectorOpen && <Inspector />}
      </div>
      {tab?.error && (
        <div className="shrink-0 border-t border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Could not load this page — {tab.error}
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Copy, Globe, Loader2, Minus, Plus, Square, X } from 'lucide-react'
import { useApp } from '@/store'
import { cn } from '@/lib/utils'

function WindowControls(): React.JSX.Element | null {
  const [platform, setPlatform] = useState<string>('')
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.getPlatform().then(setPlatform)
    return window.api.window.onStateChange(setMaximized)
  }, [])

  // macOS keeps its native traffic lights (space is reserved in the sidebar header).
  if (platform !== 'win32' && platform !== 'linux') return null

  const btn =
    'no-drag grid h-[52px] w-11 place-items-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

  return (
    <div className="flex shrink-0">
      <button className={btn} onClick={() => window.api.window.minimize()} aria-label="Minimize">
        <Minus className="size-4" />
      </button>
      <button className={btn} onClick={() => window.api.window.maximize()} aria-label="Maximize">
        {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
      </button>
      <button
        className={cn(btn, 'hover:bg-destructive hover:text-destructive-foreground')}
        onClick={() => window.api.window.close()}
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

export function TitleBar(): React.JSX.Element {
  const { tabs, activeTabId, newTab, closeTab, activateTab } = useApp()
  const navigate = useNavigate()
  const onBrowse = useLocation().pathname === '/browse'

  const select = (id: string): void => {
    activateTab(id)
    if (!onBrowse) void navigate('/browse')
  }

  return (
    <div className="drag-region flex h-[52px] shrink-0 items-end gap-1 border-b border-border bg-sidebar pl-2 pr-0">
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId && onBrowse
          return (
            <div
              key={tab.id}
              onClick={() => select(tab.id)}
              className={cn(
                'no-drag group flex h-9 w-[220px] shrink-0 cursor-default items-center gap-2 rounded-t-lg border border-b-0 px-3 text-sm transition-colors',
                active
                  ? 'border-border bg-background text-foreground'
                  : 'border-transparent bg-transparent text-muted-foreground hover:bg-accent/60'
              )}
            >
              {tab.loading ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-brand-bright" />
              ) : tab.favicon ? (
                <img src={tab.favicon} alt="" className="size-3.5 shrink-0 rounded-sm" />
              ) : (
                <Globe className="size-3.5 shrink-0 opacity-60" />
              )}
              <span className="min-w-0 flex-1 truncate">{tab.title || 'New tab'}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className="grid size-5 shrink-0 place-items-center rounded opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                aria-label={`Close ${tab.title}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}

        <button
          onClick={() => {
            newTab()
            if (!onBrowse) void navigate('/browse')
          }}
          className="no-drag mb-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="New tab"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <WindowControls />
    </div>
  )
}

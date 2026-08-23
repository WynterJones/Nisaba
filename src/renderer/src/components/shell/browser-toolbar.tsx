import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  Columns2,
  ExternalLink,
  Lock,
  PanelRight,
  RotateCw,
  Settings2,
  Sparkles,
  SquareDashedMousePointer,
  TriangleAlert,
  X
} from 'lucide-react'
import { useActiveTab, useApp, type Tool } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

/** Bare domains and anything with a scheme are URLs; everything else is a web search. */
export function toUrl(input: string): string {
  const value = input.trim()
  if (!value) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value
  if (/^[^\s/]+\.[^\s/]{2,}(\/|$|\?)/.test(value)) return `https://${value}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`
}

const TOOLS: { id: Exclude<Tool, null>; label: string; icon: typeof Camera }[] = [
  { id: 'capture', label: 'Capture', icon: Camera },
  { id: 'extract', label: 'Extract', icon: SquareDashedMousePointer },
  { id: 'convert', label: 'Convert', icon: Sparkles }
]

export function BrowserToolbar(): React.JSX.Element {
  const tab = useActiveTab()
  const { tool, setTool, inspectorOpen, toggleInspector } = useApp()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(tab?.url ?? '')
  }, [tab?.url, editing])

  const disabled = !tab
  const secure = (tab?.url ?? '').startsWith('https://')

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const url = toUrl(draft)
    if (url) void window.api.browser.navigate(url)
    ;(document.activeElement as HTMLElement)?.blur()
  }

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || !tab?.canGoBack}
          onClick={() => window.api.browser.back()}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || !tab?.canGoForward}
          onClick={() => window.api.browser.forward()}
          aria-label="Forward"
        >
          <ArrowRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={() => (tab?.loading ? window.api.browser.stop() : window.api.browser.reload())}
          aria-label={tab?.loading ? 'Stop' : 'Reload'}
        >
          {tab?.loading ? <X className="size-4" /> : <RotateCw className="size-4" />}
        </Button>
      </div>

      <form onSubmit={submit} className="min-w-0 flex-1">
        <div className="group flex h-9 items-center gap-2 rounded-lg border border-input bg-secondary/60 px-3 transition-colors focus-within:border-brand-bright focus-within:bg-secondary">
          {tab?.error ? (
            <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
          ) : (
            <Lock
              className={cn('size-3.5 shrink-0', secure ? 'text-emerald-500' : 'text-muted-foreground')}
            />
          )}
          <input
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => {
              setEditing(true)
              e.target.select()
            }}
            onBlur={() => setEditing(false)}
            placeholder="Search or enter a URL"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          {tab?.url && (
            <button
              type="button"
              title="Open in your default browser"
              onClick={() => window.api.browser.openExternal(tab.url)}
              className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            >
              <ExternalLink className="size-3.5" />
            </button>
          )}
        </div>
      </form>

      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            disabled={disabled}
            onClick={() => setTool(id)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
              tool === id
                ? 'bg-brand/15 text-brand-bright shadow-[0_0_16px_-6px_var(--brand-bright)] ring-1 ring-inset ring-brand/50'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <Icon className="size-4" />
            {label}
            {id === 'convert' && <ChevronDown className="size-3 opacity-60" />}
          </button>
        ))}
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleInspector}
          title="Inspector"
          className={cn(inspectorOpen && 'text-brand-bright')}
          aria-label="Toggle inspector"
        >
          <PanelRight className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" title="Compare source and output" aria-label="Compare view">
          <Columns2 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Browser settings">
          <Settings2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

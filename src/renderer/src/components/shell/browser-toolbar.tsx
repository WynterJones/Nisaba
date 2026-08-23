import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  Columns2,
  Crop,
  ExternalLink,
  Layers,
  Loader2,
  Lock,
  PanelRight,
  RotateCw,
  Blocks,
  Palette,
  Sparkles,
  SquareDashedMousePointer,
  TriangleAlert,
  X
} from 'lucide-react'
import {
  cancelExtract,
  captureFullPage,
  captureRegion,
  captureViewport,
  detectElements,
  profileDesign,
  startExtract
} from '@/actions'
import { ElementPicker } from '@/components/shell/element-picker'
import { useActiveTab, useApp } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import type { ElementCandidate } from '../../../../preload'

/** Bare domains and anything with a scheme are URLs; everything else is a web search. */
export function toUrl(input: string): string {
  const value = input.trim()
  if (!value) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value
  if (/^[^\s/]+\.[^\s/]{2,}(\/|$|\?)/.test(value)) return `https://${value}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`
}

export const OUTPUT_PROFILES = [
  { id: 'react-tailwind', label: 'React + Tailwind' },
  { id: 'react-shadcn', label: 'React + shadcn/ui' },
  { id: 'next-marketing', label: 'Next.js marketing page' },
  { id: 'static-html', label: 'Static HTML + CSS' }
] as const

export type OutputProfile = (typeof OUTPUT_PROFILES)[number]['id']

function AddressBar({ disabled }: { disabled: boolean }): React.JSX.Element {
  const tab = useActiveTab()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(tab?.url ?? '')
  }, [tab?.url, editing])

  const secure = (tab?.url ?? '').startsWith('https://')

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const url = toUrl(draft)
    if (url) void window.api.browser.navigate(url)
    ;(document.activeElement as HTMLElement)?.blur()
  }

  return (
    <form onSubmit={submit} className="min-w-0 flex-1">
      <div className="group flex h-9 items-center gap-2 rounded-lg border border-input bg-secondary/60 px-3 transition-colors focus-within:border-brand-bright focus-within:bg-secondary">
        {tab?.error ? (
          <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <Lock
            className={cn(
              'size-3.5 shrink-0',
              secure ? 'text-emerald-500' : 'text-muted-foreground'
            )}
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
  )
}

const toolClass = (active: boolean): string =>
  cn(
    'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
    active
      ? 'bg-brand/15 text-brand-bright shadow-[0_0_16px_-6px_var(--brand-bright)] ring-1 ring-inset ring-brand/50'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  )

export function BrowserToolbar(): React.JSX.Element {
  const tab = useActiveTab()
  const { tool, setTool, picking, selection, inspectorOpen, toggleInspector, setOverlay } = useApp()
  const [candidates, setCandidates] = useState<ElementCandidate[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const disabled = !tab

  const openMenu = (open: boolean): void => setOverlay(open)

  const scan = async (): Promise<void> => {
    setScanning(true)
    const found = await detectElements()
    setScanning(false)
    if (found.length === 0) return
    setOverlay(true)
    setCandidates(found)
  }

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      {candidates && (
        <ElementPicker candidates={candidates} onClose={() => setCandidates(null)} />
      )}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || !tab?.canGoBack}
          onClick={() => window.api.browser.back()}
          title="Back"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || !tab?.canGoForward}
          onClick={() => window.api.browser.forward()}
          title="Forward"
          aria-label="Forward"
        >
          <ArrowRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={() => (tab?.loading ? window.api.browser.stop() : window.api.browser.reload())}
          title={tab?.loading ? 'Stop' : 'Reload'}
          aria-label={tab?.loading ? 'Stop' : 'Reload'}
        >
          {tab?.loading ? <X className="size-4" /> : <RotateCw className="size-4" />}
        </Button>
      </div>

      <AddressBar disabled={disabled} />

      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
        <DropdownMenu onOpenChange={openMenu}>
          <DropdownMenuTrigger asChild>
            <button
              disabled={disabled || scanning}
              className={toolClass(false)}
              title="Capture or analyse this page"
            >
              {scanning ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              Capture
              <ChevronDown className="size-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Capture</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void captureViewport()}>
              <Camera />
              Visible viewport
              <DropdownMenuShortcut>⌘⇧2</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void captureFullPage()}>
              <Layers />
              Full scrollable page
              <DropdownMenuShortcut>⌘⇧3</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void captureRegion()}>
              <Crop />
              Drag a region
              <DropdownMenuShortcut>⌘⇧4</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void startExtract()}>
              <SquareDashedMousePointer />
              Pick an element
              <DropdownMenuShortcut>⌘⇧E</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Analyse</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void scan()}>
              <Blocks />
              Detect elements
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void profileDesign()}>
              <Palette />
              Profile this page
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          disabled={disabled}
          onClick={() => (picking ? void cancelExtract() : void startExtract())}
          title={picking ? 'Cancel selection' : 'Select a section on the page'}
          className={toolClass(picking || tool === 'extract')}
        >
          {picking ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SquareDashedMousePointer className="size-4" />
          )}
          {picking ? 'Picking…' : 'Extract'}
        </button>

        <button
          disabled={disabled || !selection}
          onClick={() => setTool('convert')}
          title={selection ? 'Convert this selection to code' : 'Extract a section first'}
          className={toolClass(tool === 'convert')}
        >
          <Sparkles className="size-4" />
          Convert
        </button>
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
        <Button
          variant="ghost"
          size="icon"
          disabled
          title="Compare source and output — available once a component is generated"
          aria-label="Compare view"
        >
          <Columns2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}

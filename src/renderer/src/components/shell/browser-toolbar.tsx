import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Crop,
  ExternalLink,
  Layers,
  LayoutTemplate,
  Loader2,
  Maximize2,
  Monitor,
  MousePointerClick,
  Smartphone,
  Tablet,
  Lock,
  PanelRight,
  RotateCw,
  Blocks,
  Palette,
  PenLine,
  SquareDashedMousePointer,
  TriangleAlert,
  X
} from 'lucide-react'
import {
  cancelExtract,
  captureFullPage,
  captureRegion,
  captureElement,
  captureViewport,
  captureWholePage,
  detectElements,
  profileDesign,
  startExtract
} from '@/actions'
import { useAudit } from '@/audit'
import { toast } from 'sonner'
import { ElementPicker } from '@/components/shell/element-picker'
import type { ViewportPreset } from '@/actions'
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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

const PRESETS: { id: ViewportPreset; label: string; width: number; icon: typeof Monitor }[] = [
  { id: 'mobile', label: 'Mobile', width: 390, icon: Smartphone },
  { id: 'tablet', label: 'Tablet', width: 834, icon: Tablet },
  { id: 'desktop', label: 'Desktop', width: 1440, icon: Monitor }
]

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
  const { picking, inspectorOpen, toggleInspector, setOverlay } = useApp()
  const viewportWidth = useApp((s) => s.viewportWidth)
  const setViewportWidth = useApp((s) => s.setViewportWidth)
  const DeviceIcon = PRESETS.find((p) => p.width === viewportWidth)?.icon ?? Maximize2
  const [candidates, setCandidates] = useState<ElementCandidate[] | null>(null)
  const audit = useAudit()
  const [scanning, setScanning] = useState(false)
  const disabled = !tab

  const openMenu = (open: boolean): void => setOverlay(open)

  /**
   * A menu is open with the page hidden behind it. Anything that hands control to the live
   * page has to wait for the native view to come back, or the user is picking on a blank area.
   */
  const afterMenu = (fn: () => void | Promise<void>) => (): void => {
    setTimeout(() => void fn(), 150)
  }

  const scan = async (): Promise<void> => {
    setScanning(true)
    const found = await detectElements()
    setScanning(false)
    if (found.length === 0) {
      // Silence here reads as a broken button — the page genuinely had nothing to offer.
      toast.info('No elements found on this page', {
        description: 'Nisaba looks for buttons, inputs, cards and badges that are actually visible.'
      })
      return
    }
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
            {/* The page is narrowed to the preset for the shot, then put back. */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Smartphone />
                At a set width
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {PRESETS.map(({ id, label, width, icon: PresetIcon }) => (
                  <DropdownMenuSub key={id}>
                    <DropdownMenuSubTrigger>
                      <PresetIcon />
                      <span className="flex-1">{label}</span>
                      <span className="text-xs text-muted-foreground">{width}px</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onSelect={() => void captureViewport(id)}>
                        <Camera />
                        Visible viewport
                        {id === 'desktop' && <DropdownMenuShortcut>⌘⇧2</DropdownMenuShortcut>}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void captureFullPage(id)}>
                        <Layers />
                        Full page
                        {id === 'desktop' && <DropdownMenuShortcut>⌘⇧3</DropdownMenuShortcut>}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={() => void captureRegion()}>
              <Crop />
              Drag a region
              <DropdownMenuShortcut>⌘⇧4</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Analyse</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void scan()}>
              <Blocks />
              Detect elements
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void profileDesign()}>
              <Palette />
              Generate Design System
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* One menu for everything you pull off a page, smallest to largest. */}
        {picking ? (
          <button
            onClick={() => void cancelExtract()}
            title="Cancel selection"
            className={toolClass(true)}
          >
            <Loader2 className="size-4 animate-spin" />
            Picking…
          </button>
        ) : (
          <DropdownMenu onOpenChange={openMenu}>
            <DropdownMenuTrigger asChild>
              <button
                disabled={disabled}
                className={toolClass(false)}
                title="Take an element, a section or the whole page off this page"
              >
                <SquareDashedMousePointer className="size-4" />
                Extract
                <ChevronDown className="size-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Extract</DropdownMenuLabel>
              <DropdownMenuItem onSelect={afterMenu(() => captureElement())}>
                <MousePointerClick />
                <span className="flex-1">Element</span>
                <span className="text-[10px] text-muted-foreground">to Captures</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={afterMenu(() => startExtract())}>
                <Blocks />
                <span className="flex-1">Component</span>
                <span className="text-[10px] text-muted-foreground">a section</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={afterMenu(() => captureWholePage())}>
                <LayoutTemplate />
                <span className="flex-1">Template</span>
                <span className="text-[10px] text-muted-foreground">whole page</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Lays the page out at a device width for testing. The native view is resized to
            match, so media queries and touch layouts behave as they would in a real browser. */}
        <DropdownMenu onOpenChange={openMenu}>
          <DropdownMenuTrigger asChild>
            <button
              disabled={disabled}
              className={toolClass(viewportWidth !== null)}
              title="Lay the page out at a device width"
            >
              <DeviceIcon className="size-4" />
              {viewportWidth ? `${viewportWidth}px` : 'Fit'}
              <ChevronDown className="size-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Viewport</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setViewportWidth(null)}>
              <Maximize2 />
              <span className="flex-1">Fit</span>
              <Check className={cn('size-3.5', viewportWidth !== null && 'opacity-0')} />
            </DropdownMenuItem>
            {PRESETS.map(({ id, label, width, icon: PresetIcon }) => (
              <DropdownMenuItem key={id} onSelect={() => setViewportWidth(width)}>
                <PresetIcon />
                <span className="flex-1">{label}</span>
                <span className="text-xs text-muted-foreground">{width}px</span>
                <Check className={cn('size-3.5', viewportWidth !== width && 'opacity-0')} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          disabled={disabled}
          onClick={() => (audit.active ? void audit.stop() : void audit.start())}
          title={
            audit.active
              ? 'Finish the audit'
              : 'Audit this page — pin notes to elements and export a task plan'
          }
          className={toolClass(audit.active)}
        >
          <PenLine className="size-4" />
          {audit.active ? `Auditing · ${audit.draft?.pins.length ?? 0}` : 'Audit'}
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
      </div>
    </div>
  )
}

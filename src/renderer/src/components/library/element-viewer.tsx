import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, Copy, ExternalLink, Globe, Moon, Sun, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo } from '@/components/library/frame'
import { useApp, useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDelete } from '@/components/confirm-delete'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CodeView } from '@/components/ui/code-view'
import type { ElementRecord } from '../../../../preload'
import { openInApp } from '@/actions'

/**
 * Turns the captured computed styles back into a rule you can paste. The class is named after
 * what the element *is*, not where it came from — a saved element is a copy to reuse, and the
 * path back to the page it was lifted from is no use in your own project.
 */
export function toCss(record: ElementRecord): string {
  const selector = `.${(record.category || 'element').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const body = Object.entries(record.styles)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n')
  return `/* ${record.category} — ${record.host} */\n${selector} {\n${body}\n}`
}

/** Tailwind can't be recovered exactly, so this is the honest subset: arbitrary values. */
export function toTailwind(record: ElementRecord): string {
  const map: [string, string][] = [
    ['display', 'display'],
    ['padding', 'p'],
    ['gap', 'gap'],
    ['font-size', 'text'],
    ['font-weight', 'font'],
    ['line-height', 'leading'],
    ['letter-spacing', 'tracking'],
    ['color', 'text'],
    ['background-color', 'bg'],
    ['border-radius', 'rounded'],
    ['box-shadow', 'shadow'],
    ['border', 'border']
  ]
  const parts: string[] = []
  for (const [prop, prefix] of map) {
    const value = record.styles[prop]
    if (!value) continue
    if (prop === 'display') {
      parts.push(value)
      continue
    }
    parts.push(`${prefix}-[${value.replace(/\s+/g, '_')}]`)
  }
  return parts.join(' ')
}

/** The small pill used for every toggle in this dialog. */
function Chip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] transition-colors',
        active
          ? 'bg-brand/20 text-brand-bright'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function CopyButton({ text, label }: { text: string; label: string }): React.JSX.Element {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setDone(true)
        toast.success(`${label} copied`)
        setTimeout(() => setDone(false), 1400)
      }}
    >
      {done ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      {label}
    </Button>
  )
}

/**
 * The saved markup and rules, rendered for real so the element can be hovered, focused and
 * poked at instead of only looked at. Sandboxed with no scripts and no origin: what is in
 * here came off someone else's page, and the app window is not a place to run it.
 */
function LivePreview({
  html,
  css,
  dark
}: {
  html: string
  css: string
  dark: boolean
}): React.JSX.Element {
  const doc = useMemo(
    () =>
      [
        '<!doctype html><meta charset="utf-8">',
        // Styles are ours and the page's; images and fonts still load, or the preview is a
        // grey box. Everything executable is refused.
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src * data: blob:; font-src * data:; style-src \'unsafe-inline\'">',
        `<style>html{background:${dark ? '#101013' : '#ffffff'};color-scheme:${dark ? 'dark' : 'light'}}`,
        'body{margin:0;padding:24px;min-height:100vh;box-sizing:border-box;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif}</style>',
        `<style>${css}</style>`,
        // A click inside the frame must not navigate the preview away from the element.
        html.replace(/\shref=/g, ' data-href=')
      ].join(''),
    [html, css, dark]
  )
  return (
    <iframe
      srcDoc={doc}
      sandbox=""
      title="Live preview"
      className="size-full border-0 bg-white"
    />
  )
}

export function ElementViewer({
  record,
  onClose
}: {
  record: ElementRecord
  onClose: () => void
}): React.JSX.Element {
  const [state, setState] = useState('default')
  // Edits are local to this dialog — the saved record is what the page really had, and the
  // point of editing here is to try something, not to rewrite history.
  const [html, setHtml] = useState(record.html ?? '')
  const [css, setCss] = useState(record.css ?? toCss(record))
  const [live, setLive] = useState(!!record.html)
  const [dark, setDark] = useState(false)
  const remove = useLibrary((s) => s.remove)
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()

  const frames = [{ state: 'default', file: record.file }, ...record.states]
  const shown = frames.find((f) => f.state === state) ?? frames[0]
  const tw = toTailwind(record)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(920px,94vw)]">
        <DialogHeader>
          <DialogTitle className="truncate">{record.label}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px] font-normal">
              {record.category}
            </Badge>
            <span>{record.host}</span>
            <span>·</span>
            <span className="tabular-nums">
              {Math.round(record.rect.width)} × {Math.round(record.rect.height)}
            </span>
            <span>·</span>
            <span>{timeAgo(record.createdAt)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <div className="h-[38vh] min-h-40 overflow-hidden rounded-lg border border-border bg-[repeating-conic-gradient(#17171b_0%_25%,#121214_0%_50%)] bg-[length:16px_16px]">
              {live ? (
                <LivePreview html={html} css={css} dark={dark} />
              ) : (
                <div className="grid size-full place-items-center overflow-auto p-6">
                  <img
                    src={window.api.library.url(shown.file)}
                    alt={record.label}
                    className="max-w-full"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {record.html && (
                <>
                  {/* The shot is what the page really rendered; the live frame is the saved
                      markup re-rendered here, and they can differ. Say which is on screen. */}
                  <Chip active={!live} onClick={() => setLive(false)}>
                    Screenshot
                  </Chip>
                  <Chip active={live} onClick={() => setLive(true)}>
                    Live
                  </Chip>
                  <span className="mx-1 h-3 w-px bg-border" />
                </>
              )}

              {live ? (
                <Chip active={dark} onClick={() => setDark(!dark)}>
                  {dark ? <Moon className="size-3" /> : <Sun className="size-3" />}
                  {dark ? 'Dark' : 'Light'}
                </Chip>
              ) : (
                frames.length > 1 &&
                frames.map((frame) => (
                  <Chip
                    key={frame.state}
                    active={shown.state === frame.state}
                    onClick={() => setState(frame.state)}
                  >
                    :{frame.state}
                  </Chip>
                ))
              )}
            </div>
          </div>

          <Tabs defaultValue={record.html ? 'html' : 'css'} className="flex min-h-0 flex-col">
            <TabsList>
              {record.html && <TabsTrigger value="html">HTML</TabsTrigger>}
              <TabsTrigger value="css">CSS</TabsTrigger>
              <TabsTrigger value="tailwind">Tailwind</TabsTrigger>
              <TabsTrigger value="props">Properties</TabsTrigger>
            </TabsList>

            {record.html && (
              <TabsContent value="html" className="m-0">
                <div className="h-[38vh] overflow-hidden rounded-lg border border-border bg-[#08080a]">
                  <CodeView value={html} filename="element.html" onChange={setHtml} />
                </div>
              </TabsContent>
            )}

            <TabsContent value="css" className="m-0">
              <div className="h-[38vh] overflow-hidden rounded-lg border border-border bg-[#08080a]">
                <CodeView value={css} filename="element.css" onChange={setCss} />
              </div>
            </TabsContent>

            <TabsContent value="tailwind" className="m-0">
              <div className="flex h-[38vh] flex-col overflow-hidden rounded-lg border border-border bg-[#08080a]">
                {/* A utility string is one long line, not source — wrap it and drop the gutter. */}
                <div className="min-h-0 flex-1">
                  <CodeView
                    value={tw || 'Nothing worth translating.'}
                    numbered={false}
                    wrap
                  />
                </div>
                <p className="shrink-0 px-3 pb-3 text-[10px] text-muted-foreground/70">
                  Arbitrary values, because the original utility classes cannot be recovered from
                  computed styles — treat this as a starting point.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="props" className="m-0">
              <ScrollArea className="h-[38vh] rounded-lg border border-border">
                <dl className="divide-y divide-border">
                  {Object.entries(record.styles).map(([key, value]) => (
                    <div key={key} className="flex gap-3 px-3 py-1.5">
                      <dt className="w-36 shrink-0 font-mono text-[10px] text-brand-bright">{key}</dt>
                      <dd className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {record.html && <CopyButton text={html} label="Copy HTML" />}
          <CopyButton text={css} label="Copy CSS" />
          <CopyButton text={tw} label="Copy Tailwind" />

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                newTab(record.url)
                onClose()
                void navigate('/browse')
              }}
            >
              <Globe className="size-3.5" />
              Open source page
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Open in a new tab"
              onClick={() => openInApp(record.url)}
            >
              <ExternalLink className="size-3.5" />
            </Button>
            <ConfirmDelete
              title="Delete this element?"
              description={record.label || record.host}
              onConfirm={async () => {
                await remove('elements', record.id)
                onClose()
              }}
            >
              <Button
                variant="ghost"
                size="icon-sm"
                title="Delete element"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </ConfirmDelete>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

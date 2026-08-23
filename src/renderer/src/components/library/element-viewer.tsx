import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, Copy, ExternalLink, Globe, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo } from '@/components/library/frame'
import { useApp, useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ElementRecord } from '../../../../preload'

/** Turns the captured computed styles back into a rule you can paste. */
export function toCss(record: ElementRecord): string {
  // The last step of the selector path is the closest thing to a name we kept.
  const selector = record.selector.split('>').pop()?.trim() || record.category.toLowerCase()
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

export function ElementViewer({
  record,
  onClose
}: {
  record: ElementRecord
  onClose: () => void
}): React.JSX.Element {
  const [state, setState] = useState('default')
  const remove = useLibrary((s) => s.remove)
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()

  const frames = [{ state: 'default', file: record.file }, ...record.states]
  const shown = frames.find((f) => f.state === state) ?? frames[0]
  const css = toCss(record)
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
            <div className="grid min-h-40 place-items-center overflow-auto rounded-lg border border-border bg-[repeating-conic-gradient(#17171b_0%_25%,#121214_0%_50%)] bg-[length:16px_16px] p-6">
              <img src={window.api.library.url(shown.file)} alt={record.label} className="max-w-full" />
            </div>

            {frames.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {frames.map((frame) => (
                  <button
                    key={frame.state}
                    onClick={() => setState(frame.state)}
                    className={cn(
                      'rounded px-2 py-1 font-mono text-[10px] transition-colors',
                      shown.state === frame.state
                        ? 'bg-brand/20 text-brand-bright'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    :{frame.state}
                  </button>
                ))}
              </div>
            )}

            <code className="truncate rounded bg-secondary/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">
              {record.selector}
            </code>
          </div>

          <Tabs defaultValue="css" className="flex min-h-0 flex-col">
            <TabsList>
              <TabsTrigger value="css">CSS</TabsTrigger>
              <TabsTrigger value="tailwind">Tailwind</TabsTrigger>
              <TabsTrigger value="props">Properties</TabsTrigger>
            </TabsList>

            <TabsContent value="css" className="m-0">
              <ScrollArea className="h-[38vh] rounded-lg border border-border bg-[#08080a]">
                <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {css}
                </pre>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="tailwind" className="m-0">
              <ScrollArea className="h-[38vh] rounded-lg border border-border bg-[#08080a]">
                <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {tw || 'Nothing worth translating.'}
                </pre>
                <p className="px-3 pb-3 text-[10px] text-muted-foreground/70">
                  Arbitrary values, because the original utility classes cannot be recovered from
                  computed styles — treat this as a starting point.
                </p>
              </ScrollArea>
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
          <CopyButton text={css} label="Copy CSS" />
          <CopyButton text={tw} label="Copy Tailwind" />
          <CopyButton text={record.selector} label="Copy selector" />

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
              title="Open in your default browser"
              onClick={() => window.api.browser.openExternal(record.url)}
            >
              <ExternalLink className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete element"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                void remove('elements', record.id)
                onClose()
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

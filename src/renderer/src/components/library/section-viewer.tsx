import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, Copy, ExternalLink, FolderOpen, Globe, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo } from '@/components/library/frame'
import { TagEditor } from '@/components/library/tag-editor'
import { useApp, useLibrary } from '@/store'
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
import type { SectionRecord } from '../../../../preload'

function CopyButton({ text, label }: { text: string; label: string }): React.JSX.Element {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={!text}
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

export function SectionViewer({
  record,
  onClose
}: {
  record: SectionRecord
  onClose: () => void
}): React.JSX.Element {
  const remove = useLibrary((s) => s.remove)
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()

  const css = Object.entries(record.styles)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n')
  const variables = Object.entries(record.variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(1000px,94vw)]">
        <DialogHeader>
          <DialogTitle className="truncate">{record.name}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px] font-normal">
              &lt;{record.tag}&gt;
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
            <ScrollArea className="h-[42vh] rounded-lg border border-border bg-secondary/30">
              <img src={window.api.library.url(record.file)} alt={record.name} className="w-full" />
            </ScrollArea>

            <code className="truncate rounded bg-secondary/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">
              {record.selector}
            </code>

            <div className="flex flex-wrap gap-1">
              {record.colors.slice(0, 10).map((color, i) => (
                <span
                  key={`${color}-${i}`}
                  title={color}
                  style={{ background: color }}
                  className="size-5 rounded border border-white/10"
                />
              ))}
            </div>

            <div className="flex flex-wrap gap-1">
              {record.fonts.map((font) => (
                <Badge key={font} variant="secondary" className="text-[10px] font-normal">
                  {font}
                </Badge>
              ))}
              {record.tech.map((t) => (
                <Badge key={t.name} variant="secondary" className="text-[10px] font-normal">
                  {t.name} {Math.round(t.confidence * 100)}%
                </Badge>
              ))}
            </div>

            <TagEditor collection="sections" id={record.id} tags={record.tags ?? []} />
          </div>

          <Tabs defaultValue="html" className="flex min-h-0 flex-col">
            <TabsList>
              <TabsTrigger value="html">HTML</TabsTrigger>
              <TabsTrigger value="css">Styles</TabsTrigger>
              <TabsTrigger value="vars">Variables</TabsTrigger>
            </TabsList>

            <TabsContent value="html" className="m-0">
              <ScrollArea className="h-[42vh] rounded-lg border border-border bg-[#08080a]">
                <pre className="whitespace-pre-wrap p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {record.html}
                </pre>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="css" className="m-0">
              <ScrollArea className="h-[42vh] rounded-lg border border-border bg-[#08080a]">
                <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {`${record.selector.split('>').pop()?.trim()} {\n${css}\n}`}
                </pre>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="vars" className="m-0">
              <ScrollArea className="h-[42vh] rounded-lg border border-border bg-[#08080a]">
                <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {variables ? `:root {\n${variables}\n}` : 'No custom properties in scope.'}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={record.html} label="Copy HTML" />
          <CopyButton text={css} label="Copy styles" />
          <CopyButton text={record.selector} label="Copy selector" />

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Reveal in Finder"
              onClick={() => window.api.library.reveal(record.file)}
            >
              <FolderOpen className="size-3.5" />
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
              title="Delete section"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => {
                void remove('sections', record.id)
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

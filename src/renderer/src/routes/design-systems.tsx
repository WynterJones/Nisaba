import { useEffect, useState } from 'react'
import {
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
  Palette,
  Save,
  Sparkles,
  Trash2,
  Wand2
} from 'lucide-react'
import { toast } from 'sonner'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
import { DesignPreview } from '@/components/library/design-preview'
import { DEFAULT_LEVELS, toDesignMd, type Levels } from '../../../shared/design-spec'
import { useLibrary } from '@/store'
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
import type { DesignSystemRecord } from '../../../preload'

function TokenList({ label, values }: { label: string; values: string[] }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      {values.length === 0 ? (
        <span className="text-xs text-muted-foreground">None observed.</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <code
              key={v}
              className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {v}
            </code>
          ))}
        </div>
      )}
    </div>
  )
}

/** Which profiles have an agent working on them right now, so the UI can say so. */
function useRefining(): {
  refining: Set<string>
  start: (record: DesignSystemRecord) => Promise<void>
} {
  const [refining, setRefining] = useState<Set<string>>(new Set())

  useEffect(
    () =>
      window.api.design.onRefined((state) => {
        setRefining((current) => {
          const next = new Set(current)
          next.delete(state.id)
          return next
        })
        void useLibrary.getState().refresh()
        if (state.status === 'done') {
          toast.success('Profile refined', { description: 'The agent corrected the measurements.' })
        } else {
          toast.error('Refinement failed', { description: state.error ?? undefined })
        }
      }),
    []
  )

  const start = async (record: DesignSystemRecord): Promise<void> => {
    try {
      const state = await window.api.design.refine(record)
      setRefining((current) => new Set(current).add(record.id))
      toast.info(`${state.agent === 'claude' ? 'Claude Code' : 'Codex'} is refining this profile`, {
        description: 'It reads the screenshot and the raw samples. Watch it in the terminal dock.'
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
    }
  }

  return { refining, start }
}

function Detail({
  record,
  onClose,
  onRefine,
  refining
}: {
  record: DesignSystemRecord
  onClose: () => void
  onRefine: () => void
  refining: boolean
}): React.JSX.Element {
  const [levels, setLevels] = useState<Levels>(record.levels ?? DEFAULT_LEVELS)
  const dirty = JSON.stringify(levels) !== JSON.stringify(record.levels ?? DEFAULT_LEVELS)

  // Re-emitted locally as the dials move; only saving writes it back to disk.
  const designMd = record.spec
    ? toDesignMd(
        record.spec,
        { url: record.url, host: record.host, capturedAt: record.createdAt },
        levels
      )
    : record.designMd

  const copy = (text: string, what: string): void => {
    void navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  }

  const save = async (): Promise<void> => {
    const written = await window.api.design.restyle(record, levels)
    await window.api.library.patch('designSystems', record.id, { levels, designMd: written })
    await useLibrary.getState().refresh()
    toast.success('design.md updated', {
      description: `Shape ${levels.shape} · density ${levels.density} · depth ${levels.emphasis}`
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(880px,92vw)]">
        <DialogHeader>
          <DialogTitle>{record.name}</DialogTitle>
          <DialogDescription>
            Measured from {record.url}
            {record.refinedAt && ' · corrected by an agent'}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={record.spec ? 'preview' : 'tokens'}>
          <TabsList>
            {record.spec && <TabsTrigger value="preview">Preview</TabsTrigger>}
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="type">Type scale</TabsTrigger>
            <TabsTrigger value="md">design.md</TabsTrigger>
          </TabsList>

          {record.spec && (
            <TabsContent value="preview">
              <DesignPreview spec={record.spec} levels={levels} onLevels={setLevels} />
            </TabsContent>
          )}

          <TabsContent value="tokens">
            <ScrollArea className="h-[52vh]">
              <div className="flex flex-col gap-5 pr-3">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Colours
                  </span>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
                    {record.tokens.colors.map((c, i) => (
                      <button
                        key={`${c.value}-${i}`}
                        onClick={() => copy(c.value, 'Colour')}
                        className="flex items-center gap-2 rounded-lg border border-border p-2 text-left transition-colors hover:border-brand/50"
                      >
                        <span
                          style={{ background: c.value }}
                          className="size-8 shrink-0 rounded border border-white/10"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[10px]">{c.value}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {c.role}{' '}
                            <em className={c.inferred ? 'text-amber-400/80' : ''}>
                              ({c.inferred ? 'inferred' : 'observed'})
                            </em>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <TokenList label="Spacing scale (inferred)" values={record.tokens.spacing} />
                <TokenList label="Radii" values={record.tokens.radii} />
                <TokenList label="Shadows" values={record.tokens.shadows} />
                <TokenList label="Breakpoints" values={record.tokens.breakpoints} />
                <TokenList
                  label={`CSS custom properties (${Object.keys(record.tokens.variables).length})`}
                  values={Object.entries(record.tokens.variables)
                    .slice(0, 60)
                    .map(([k, v]) => `${k}: ${v}`)}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="type">
            <ScrollArea className="h-[52vh]">
              <div className="flex flex-col gap-3 pr-3">
                {record.typeScale.map((t) => (
                  <div
                    key={t.tag}
                    className="flex items-baseline gap-3 rounded-lg border border-border p-3"
                  >
                    <code className="w-14 shrink-0 font-mono text-xs text-brand-bright">
                      {t.tag}
                    </code>
                    <span
                      className="min-w-0 flex-1 truncate"
                      style={{
                        fontSize: t.size,
                        fontWeight: Number(t.weight) || 400,
                        lineHeight: t.lineHeight,
                        fontFamily: t.family
                      }}
                    >
                      The quick brown fox
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {t.size} / {t.weight} / {t.lineHeight}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="md">
            <ScrollArea className="h-[52vh]">
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {designMd}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-end gap-2">
          {record.spec && (
            <Button
              variant="secondary"
              disabled={refining}
              title="Hand the screenshot and the raw samples to your agent CLI and let it correct the measurements"
              onClick={onRefine}
            >
              {refining ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              {refining ? 'Refining…' : record.refinedAt ? 'Refine again' : 'Refine with agent'}
            </Button>
          )}
          {dirty && (
            <span className="mr-auto text-[11px] text-amber-300/80">
              Levels changed — save to write the new design.md.
            </span>
          )}
          {record.spec && (
            <Button disabled={!dirty} onClick={() => void save()}>
              <Save className="size-4" />
              Save levels
            </Button>
          )}
          <Button variant="secondary" onClick={() => copy(designMd, 'design.md')}>
            <Copy className="size-4" />
            Copy design.md
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.api.library.reveal(record.file.replace(/\.png$/, '.md'))}
          >
            <FolderOpen className="size-4" />
            Reveal files
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function DesignSystems(): React.JSX.Element {
  const { designSystems, remove } = useLibrary()
  const [open, setOpen] = useState<DesignSystemRecord | null>(null)
  const { refining, start } = useRefining()

  return (
    <>
      <LibraryFrame
        icon={Palette}
        title="Design Systems"
        items={designSystems}
        search={(d) => `${d.name} ${d.host} ${d.url}`}
        emptyTitle="No design profiles yet"
        emptyBlurb="Open a page in Browse and run Profile this page. Nisaba measures the colours, type, spacing, radii, shadows and breakpoints it actually uses, and writes an editable design.md and tokens.json."
        groupBy={{ label: 'Site', of: (d) => d.host }}
        nameOf={(d) => d.name}
      >
        {(rows) => (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4 p-5">
            {rows.map((record) => (
              <article
                key={record.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-brand/50"
              >
                <button
                  onClick={() => setOpen(record)}
                  className="block max-h-40 overflow-hidden bg-secondary/40"
                >
                  <img
                    src={window.api.library.url(record.file, true)}
                    alt={record.name}
                    loading="lazy"
                    className="w-full object-cover object-top"
                  />
                </button>

                <div className="flex flex-col gap-2 border-t border-border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{record.host}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {record.tokens.colors.length} colours · {record.typeScale.length} type steps
                        · {timeAgo(record.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={!record.spec || refining.has(record.id)}
                        title="Refine this profile with your agent"
                        onClick={() => void start(record)}
                      >
                        {refining.has(record.id) ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Open source page"
                        onClick={() => window.api.browser.openExternal(record.url)}
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Delete"
                        className="hover:text-destructive"
                        onClick={() => void remove('designSystems', record.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {record.tokens.colors.slice(0, 8).map((c, i) => (
                      <span
                        key={`${c.value}-${i}`}
                        title={`${c.value} — ${c.role}`}
                        style={{ background: c.value }}
                        className="size-5 rounded border border-white/10"
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {record.refinedAt && (
                      <Badge className="gap-1 bg-brand/15 text-[10px] font-normal text-brand-bright">
                        <Sparkles className="size-2.5" />
                        Agent-refined
                      </Badge>
                    )}
                    {record.tokens.fonts.slice(0, 2).map((f) => (
                      <Badge key={f.family} variant="secondary" className="text-[10px] font-normal">
                        {f.family}
                      </Badge>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </LibraryFrame>

      {open && (
        <Detail
          record={designSystems.find((d) => d.id === open.id) ?? open}
          onClose={() => setOpen(null)}
          refining={refining.has(open.id)}
          onRefine={() => void start(open)}
        />
      )}
    </>
  )
}

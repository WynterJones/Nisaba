import { ChevronRight, MousePointerClick, Save, Sparkles } from 'lucide-react'
import { useApp } from '@/store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      {children}
    </div>
  )
}

function Swatches({ colors }: { colors: string[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <div
          key={c}
          title={c}
          style={{ background: c }}
          className="size-7 rounded-md border border-white/10 shadow-sm"
        />
      ))}
    </div>
  )
}

// ponytail: fixture shape only — Phase 3's extraction engine fills this from the live page.
const SAMPLE = {
  dom: [
    { depth: 0, tag: 'section', attr: 'id="pricing"' },
    { depth: 1, tag: 'div', attr: 'class="container"' },
    { depth: 2, tag: 'div', attr: 'class="grid grid-cols-4 gap-6"' },
    { depth: 3, tag: 'div', attr: 'class="pricing-card" ×4' }
  ],
  tokens: ['#0d0d0f', '#1f1f23', '#f4f4f5', '#7928db', '#a855f7'],
  colors: ['#000000', '#ffffff', '#3f3f46', '#e4e4e7', '#7928db', '#c084fc'],
  fonts: ['Inter', 'Inter Tight'],
  deps: ['tailwindcss ^3.4.0', 'lucide-react ^0.377.0']
}

function InspectBody(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5 p-4">
      <Field label="Section name">
        <Input defaultValue="Pricing — 4 Column" className="h-9" />
      </Field>

      <Field label="Screenshot">
        <div className="relative aspect-video overflow-hidden rounded-lg border border-brand/60 bg-secondary/50 ring-1 ring-brand/20">
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            Region preview
          </div>
          {(['left-1.5 top-1.5', 'right-1.5 top-1.5', 'left-1.5 bottom-1.5', 'right-1.5 bottom-1.5'] as const).map(
            (pos) => (
              <span key={pos} className={cn('absolute size-1.5 rounded-full bg-brand-bright', pos)} />
            )
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">1920 × 860</span>
          <span>PNG</span>
        </div>
      </Field>

      <Field label="DOM summary">
        <div className="rounded-lg border border-border bg-secondary/30 p-2 font-mono text-xs">
          {SAMPLE.dom.map((node) => (
            <div
              key={node.tag + node.attr}
              className="flex items-center gap-1.5 py-0.5"
              style={{ paddingLeft: node.depth * 12 }}
            >
              <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
              <span className="text-brand-bright">&lt;{node.tag}&gt;</span>
              <span className="truncate rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {node.attr}
              </span>
            </div>
          ))}
        </div>
      </Field>

      <Field label="CSS tokens">
        <Swatches colors={SAMPLE.tokens} />
      </Field>

      <Field label="Fonts">
        <div className="flex flex-wrap gap-4">
          {SAMPLE.fonts.map((f) => (
            <div key={f} className="flex items-center gap-2 text-sm">
              <span className="grid size-7 place-items-center rounded-md bg-secondary text-xs font-semibold">
                Aa
              </span>
              <span className="text-muted-foreground">{f}</span>
            </div>
          ))}
        </div>
      </Field>

      <Field label="Colors">
        <Swatches colors={SAMPLE.colors} />
      </Field>

      <Field label="Dependencies">
        <div className="flex flex-wrap gap-1.5">
          {SAMPLE.deps.map((d) => (
            <Badge key={d} variant="secondary" className="font-mono text-[10px] font-normal">
              {d}
            </Badge>
          ))}
        </div>
      </Field>

      <Field label="Framework detection">
        <div className="flex items-center gap-2 text-sm">
          <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60" />
          <span className="font-medium">Next.js</span>
          <span className="text-xs text-muted-foreground">Detected v14.2.3 · high confidence</span>
        </div>
      </Field>
    </div>
  )
}

function EmptyBody({ hint }: { hint: string }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-border bg-secondary/50">
        <MousePointerClick className="size-5 text-muted-foreground" />
      </span>
      <p className="max-w-[220px] text-sm text-muted-foreground">{hint}</p>
    </div>
  )
}

export function Inspector(): React.JSX.Element {
  const tool = useApp((s) => s.tool)
  const selected = tool === 'extract'

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-sidebar">
      <Tabs defaultValue="inspect" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-transparent p-0">
          {['Inspect', 'Assets', 'AI'].map((t) => (
            <TabsTrigger
              key={t}
              value={t.toLowerCase()}
              className="relative rounded-none border-0 bg-transparent px-4 py-2.5 text-sm text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-bright after:opacity-0 data-[state=active]:after:opacity-100"
            >
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-h-0 flex-1">
          <TabsContent value="inspect" className="m-0 h-full">
            <ScrollArea className="h-full">
              {selected ? (
                <InspectBody />
              ) : (
                <EmptyBody hint="Turn on Extract, then hover the page and click a region to inspect it." />
              )}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="assets" className="m-0 h-full">
            <EmptyBody hint="Images, icons, SVG and fonts found in the selection appear here." />
          </TabsContent>
          <TabsContent value="ai" className="m-0 h-full">
            <EmptyBody hint="Pick an output profile and agent to convert this selection into code." />
          </TabsContent>
        </div>
      </Tabs>

      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border p-3">
        <Button variant="secondary" disabled={!selected}>
          <Save className="size-4" />
          Save section
        </Button>
        <Button disabled={!selected}>
          <Sparkles className="size-4" />
          Convert
        </Button>
      </div>
    </aside>
  )
}

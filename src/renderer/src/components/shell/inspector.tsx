import { useEffect, useState } from 'react'
import {
  ChevronRight,
  ExternalLink,
  FileCode2,
  Image as ImageIcon,
  Loader2,
  MousePointerClick,
  Play,
  ShieldAlert,
  Sparkles,
  Terminal,
  X
} from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { saveSelection, startExtract } from '@/actions'
import { useApp, useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import { OUTPUT_PROFILES, type OutputProfile } from '@/components/shell/browser-toolbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AgentInstallation, SectionDraft } from '../../../../preload'

function Field({
  label,
  children,
  action
}: {
  label: string
  children: React.ReactNode
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

function Swatches({ colors }: { colors: string[] }): React.JSX.Element | null {
  if (colors.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c, i) => (
        <div
          key={`${c}-${i}`}
          title={c}
          style={{ background: c }}
          className="size-7 rounded-md border border-white/10 shadow-sm"
        />
      ))}
    </div>
  )
}

function Empty({
  hint,
  action
}: {
  hint: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-border bg-secondary/50">
        <MousePointerClick className="size-5 text-muted-foreground" />
      </span>
      <p className="max-w-[220px] text-sm text-muted-foreground">{hint}</p>
      {action}
    </div>
  )
}

function InspectBody({ selection }: { selection: SectionDraft }): React.JSX.Element {
  const setSelection = useApp((s) => s.setSelection)
  const styleEntries = Object.entries(selection.styles).slice(0, 10)
  const variableEntries = Object.entries(selection.variables).slice(0, 12)

  return (
    <div className="flex flex-col gap-5 p-4">
      <Field label="Section name">
        <Input
          value={selection.name}
          onChange={(e) => setSelection({ ...selection, name: e.target.value })}
          className="h-9"
        />
      </Field>

      <Field label="Screenshot">
        <div className="overflow-hidden rounded-lg border border-brand/60 bg-secondary/50 ring-1 ring-brand/20">
          {selection.preview ? (
            <img src={selection.preview} alt="" className="w-full" />
          ) : (
            <div className="grid aspect-video place-items-center text-xs text-muted-foreground">
              No preview
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">
            {Math.round(selection.rect.width)} × {Math.round(selection.rect.height)}
          </span>
          <span>PNG</span>
        </div>
      </Field>

      <Field label="Source">
        <button
          onClick={() => window.api.browser.openExternal(selection.url)}
          className="flex items-start gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="mt-0.5 size-3 shrink-0" />
          <span className="break-all">{selection.url}</span>
        </button>
      </Field>

      <Field label="Selector">
        <code className="block break-all rounded-lg border border-border bg-secondary/30 p-2 font-mono text-[11px] text-brand-bright">
          {selection.selector}
        </code>
      </Field>

      {styleEntries.length > 0 && (
        <Field label="Computed styles">
          <div className="rounded-lg border border-border bg-secondary/30 p-2 font-mono text-[11px]">
            {styleEntries.map(([key, value]) => (
              <div key={key} className="flex gap-2 py-0.5">
                <ChevronRight className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" />
                <span className="shrink-0 text-brand-bright">{key}</span>
                <span className="truncate text-muted-foreground" title={value}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </Field>
      )}

      {variableEntries.length > 0 && (
        <Field label={`CSS variables (${Object.keys(selection.variables).length})`}>
          <div className="flex flex-wrap gap-1">
            {variableEntries.map(([key, value]) => (
              <span
                key={key}
                title={`${key}: ${value}`}
                className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {key}
              </span>
            ))}
          </div>
        </Field>
      )}

      {selection.fonts.length > 0 && (
        <Field label="Fonts">
          <div className="flex flex-wrap gap-3">
            {selection.fonts.map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <span className="grid size-7 place-items-center rounded-md bg-secondary text-xs font-semibold">
                  Aa
                </span>
                <span className="text-muted-foreground">{f}</span>
              </div>
            ))}
          </div>
        </Field>
      )}

      <Field label="Colors">
        <Swatches colors={selection.colors} />
      </Field>

      {selection.a11y.headings.length > 0 && (
        <Field label="Accessibility">
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>
              role <span className="text-foreground">{selection.a11y.role}</span>
            </span>
            {selection.a11y.headings.map((h) => (
              <span key={h} className="truncate">
                {h}
              </span>
            ))}
          </div>
        </Field>
      )}

      {selection.tech.length > 0 && (
        <Field label="Technology detection">
          <div className="flex flex-col gap-2">
            {selection.tech.map((t) => (
              <div key={t.name} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      t.confidence > 0.8
                        ? 'bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/60'
                        : t.confidence > 0.6
                          ? 'bg-amber-500'
                          : 'bg-muted-foreground'
                    )}
                  />
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(t.confidence * 100)}% confident
                  </span>
                </div>
                <span className="pl-4 text-[11px] text-muted-foreground/70">{t.evidence}</span>
              </div>
            ))}
          </div>
        </Field>
      )}

      <Field label={`Sanitized HTML (${(selection.html.length / 1024).toFixed(1)} KB)`}>
        <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-secondary/30 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {selection.html.slice(0, 2000)}
        </pre>
      </Field>
    </div>
  )
}

function AssetsBody({ selection }: { selection: SectionDraft | null }): React.JSX.Element {
  if (!selection || selection.assets.length === 0) {
    return <Empty hint="Images, icons, SVG and fonts found in the selection appear here." />
  }
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-3">
        {selection.assets.map((asset) => (
          <button
            key={asset}
            onClick={() => asset.startsWith('http') && window.api.browser.openExternal(asset)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ImageIcon className="size-3.5 shrink-0" />
            <span className="truncate">{asset.replace(/^https?:\/\//, '')}</span>
          </button>
        ))}
      </div>
    </ScrollArea>
  )
}

/** Shows the exact instruction and destination before any agent is allowed to run. */
function AiBody({ selection }: { selection: SectionDraft | null }): React.JSX.Element {
  const { workspaces, sections, refresh } = useLibrary()
  const [profile, setProfile] = useState<OutputProfile>('react-shadcn')
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [extra, setExtra] = useState('')
  const [agents, setAgents] = useState<AgentInstallation[] | null>(null)
  const [preview, setPreview] = useState<{ prompt: string; sourceDir: string; root: string } | null>(
    null
  )
  const [starting, setStarting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    void window.api.agents.detect().then(setAgents)
  }, [])

  useEffect(() => {
    if (!workspaceId && workspaces.length > 0) {
      setWorkspaceId(workspaces[0].id)
      setProfile(workspaces[0].profile as OutputProfile)
    }
  }, [workspaces, workspaceId])

  const workspace = workspaces.find((w) => w.id === workspaceId)
  const agent = agents?.find((a) => a.id === workspace?.agent)

  /** The agent reads the section from disk, so it is filed automatically when a job runs. */
  const savedSource = selection
    ? sections.find((s) => s.selector === selection.selector && s.url === selection.url)
    : undefined

  useEffect(() => {
    if (!workspace || !savedSource) return void setPreview(null)
    void window.api.jobs
      .preview({
        workspaceId: workspace.id,
        profile,
        sourceIds: [savedSource.id],
        extra,
        kind: 'component'
      })
      .then(setPreview)
      .catch(() => setPreview(null))
  }, [workspace?.id, profile, extra, savedSource?.id])

  if (!selection) {
    return <Empty hint="Extract a section first — then pick an output profile and an agent." />
  }

  const run = async (): Promise<void> => {
    if (!workspace || !agent?.path || !selection) return
    setStarting(true)
    try {
      const source = savedSource ?? (await saveSelection())
      if (!source) return
      await window.api.jobs.run({
        workspaceId: workspace.id,
        profile,
        sourceIds: [source.id],
        extra,
        kind: 'component',
        binary: agent.path,
        name: selection.name
      })
      await refresh()
      toast.success('Job started', { description: 'Watch it in the Tasks drawer.' })
      void navigate('/jobs')
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
    } finally {
      setStarting(false)
    }
  }

  const blocker = workspaces.length === 0
    ? 'Create a workspace so the agent has somewhere it is allowed to write.'
    : !agent?.path
      ? 'The agent CLI for this workspace was not found on this machine.'
      : null

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-5 p-4">
        <Field label="Output profile">
          <div className="grid gap-1">
            {OUTPUT_PROFILES.map((p) => (
              <button
                key={p.id}
                onClick={() => setProfile(p.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors',
                  profile === p.id
                    ? 'border-brand/60 bg-brand/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <FileCode2 className="size-3.5" />
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Workspace"
          action={
            <button
              onClick={() => navigate('/workspaces')}
              className="text-[10px] text-brand-bright hover:underline"
            >
              Manage
            </button>
          }
        >
          {workspaces.length === 0 ? (
            <button
              onClick={() => navigate('/workspaces')}
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-left text-xs text-amber-200/90"
            >
              No workspace yet. A job can only write inside a folder you nominate — create one
              first.
            </button>
          ) : (
            <div className="grid gap-1">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setWorkspaceId(w.id)}
                  className={cn(
                    'flex w-full min-w-0 flex-col rounded-md border px-2.5 py-2 text-left transition-colors',
                    workspaceId === w.id
                      ? 'border-brand/60 bg-brand/10'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  <span className="w-full truncate text-sm">{w.name}</span>
                  {/* A flex-column child needs an explicit width before truncate does anything. */}
                  <span
                    title={w.root}
                    className="w-full truncate font-mono text-[10px] text-muted-foreground"
                  >
                    {w.root}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Agent">
          {agents === null ? (
            <p className="text-xs text-muted-foreground">Looking for installed CLIs…</p>
          ) : agent?.path ? (
            <div className="flex items-center gap-2 text-sm">
              <Terminal className="size-3.5 text-emerald-500" />
              <span>{agent.label}</span>
              <span className="truncate text-xs text-muted-foreground">
                {agent.version ?? agent.path}
              </span>
            </div>
          ) : (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-200/90">
              No agent CLI detected. Install and authenticate Claude Code or Codex — Nisaba never
              ships or proxies a model of its own.
            </p>
          )}
        </Field>

        <Field label="Extra instructions">
          <textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            rows={3}
            placeholder="Anything specific for this run — naming, props, where to put it."
            className="w-full resize-none rounded-lg border border-input bg-secondary/40 p-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-bright"
          />
        </Field>

        {preview && (
          <>
            <Field label="Will write into">
              <code className="block break-all rounded-lg border border-border bg-secondary/30 p-2 font-mono text-[10px] text-muted-foreground">
                {preview.root}
              </code>
            </Field>

            <Field label="Resolved instruction">
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-secondary/30 p-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {preview.prompt}
              </pre>
            </Field>
          </>
        )}

        {blocker && (
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
            {blocker}
          </p>
        )}

        <Button disabled={Boolean(blocker) || starting} onClick={() => void run()}>
          {starting ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run job
        </Button>
      </div>
    </ScrollArea>
  )
}

export function Inspector(): React.JSX.Element {
  const { selection, setSelection, picking, inspectorTab, setInspectorTab } = useApp()

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-sidebar">
      <Tabs
        value={inspectorTab}
        onValueChange={(value) => setInspectorTab(value as 'inspect' | 'assets' | 'ai')}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList className="h-auto w-full justify-start rounded-none border-b border-border bg-transparent p-0">
          {['Inspect', 'Assets', 'AI'].map((t) => (
            <TabsTrigger
              key={t}
              value={t.toLowerCase()}
              className="relative rounded-none border-0 bg-transparent px-4 py-2.5 text-sm text-muted-foreground shadow-none after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-bright after:opacity-0 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:opacity-100"
            >
              {t}
            </TabsTrigger>
          ))}
          {selection && (
            <button
              onClick={() => setSelection(null)}
              title="Clear selection"
              className="ml-auto mr-2 grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </TabsList>

        <div className="min-h-0 flex-1">
          <TabsContent value="inspect" className="m-0 h-full">
            <ScrollArea className="h-full">
              {selection ? (
                <InspectBody selection={selection} />
              ) : (
                <Empty
                  hint={
                    picking
                      ? 'Hover the page and click a region. Arrow keys walk the DOM; Esc cancels.'
                      : 'Nothing selected yet. Pick a section out of the live page to inspect it.'
                  }
                  action={
                    !picking && (
                      <Button size="sm" variant="secondary" onClick={() => void startExtract()}>
                        <MousePointerClick className="size-4" />
                        Select a section
                      </Button>
                    )
                  }
                />
              )}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="assets" className="m-0 h-full">
            <AssetsBody selection={selection} />
          </TabsContent>
          <TabsContent value="ai" className="m-0 h-full">
            <AiBody selection={selection} />
          </TabsContent>
        </div>
      </Tabs>

      <div className="shrink-0 border-t border-border p-3">
        <Button
          className="w-full"
          disabled={!selection}
          onClick={() => setInspectorTab('ai')}
        >
          <Sparkles className="size-4" />
          Convert to a component
        </Button>
      </div>
    </aside>
  )
}

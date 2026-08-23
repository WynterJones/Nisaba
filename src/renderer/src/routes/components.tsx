import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Check as CheckIcon,
  CheckCircle2,
  CircleSlash,
  Copy,
  FileCode2,
  FolderOpen,
  Frame,
  LayoutTemplate,
  Link2,
  Loader2,
  MonitorPlay,
  Play,
  ShieldCheck,
  Trash2,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store'
import { cn } from '@/lib/utils'
import type { Check, PreviewState } from '../../../preload'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
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
import type { ComponentRecord } from '../../../preload'

const CHECK_ICON: Record<Check['status'], typeof CheckCircle2> = {
  pending: CircleSlash,
  running: Loader2,
  passed: CheckCircle2,
  failed: XCircle,
  skipped: CircleSlash
}

const CHECK_TINT: Record<Check['status'], string> = {
  pending: 'text-muted-foreground',
  running: 'text-brand-bright animate-spin',
  passed: 'text-emerald-500',
  failed: 'text-destructive',
  skipped: 'text-muted-foreground/50'
}

function Detail({
  record,
  onClose
}: {
  record: ComponentRecord
  onClose: () => void
}): React.JSX.Element {
  const { sections, jobs, workspaces, refresh } = useLibrary()
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()
  const [file, setFile] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [checks, setChecks] = useState<Check[]>(record.checks ?? [])
  const [copied, setCopied] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [starting, setStarting] = useState(false)
  const workspace = workspaces.find((w) => w.id === record.workspaceId)

  useEffect(() => {
    if (checks.length === 0 && workspace) {
      void window.api.verify.suggest(workspace.root).then(setChecks)
    }
    void window.api.preview.state(record.workspaceId).then(setPreview)
  }, [workspace?.root])

  useEffect(
    () =>
      window.api.verify.onProgress((p) => {
        if (p.componentId === record.id) setChecks(p.checks)
      }),
    [record.id]
  )

  const runChecks = async (): Promise<void> => {
    if (!workspace) return
    setVerifying(true)
    try {
      const results = await window.api.verify.run({
        root: workspace.root,
        checks,
        componentId: record.id
      })
      setChecks(results)
      const passed = results.length > 0 && results.every((c) => c.status === 'passed')
      await window.api.library.patch('components', record.id, {
        checks: results,
        verified: passed,
        verifiedAt: passed ? Date.now() : null,
        overridden: false
      })
      await refresh()
      toast[passed ? 'success' : 'error'](
        passed ? 'All checks passed — marked verified' : 'Verification failed'
      )
    } finally {
      setVerifying(false)
    }
  }

  /** Boots the workspace dev server, opens it in a tab and screenshots it for comparison. */
  const runPreview = async (): Promise<void> => {
    if (!workspace) return
    setStarting(true)
    try {
      const command =
        preview?.command ?? (await window.api.preview.suggest(workspace.root)) ?? 'npm run dev'
      const state = await window.api.preview.start({
        workspaceId: workspace.id,
        root: workspace.root,
        command
      })
      setPreview(state)
      if (!state.url) {
        toast.error('The dev server did not print a URL', { description: command })
        return
      }
      newTab(state.url)
      onClose()
      void navigate('/browse')
      toast.success('Preview running', {
        description: `${state.url} — capture it and use Compare against the source.`
      })
    } finally {
      setStarting(false)
    }
  }
  const sources = sections.filter((s) => record.sourceIds.includes(s.id))
  const job = jobs.find((j) => j.id === record.jobId)

  const openFile = async (name: string): Promise<void> => {
    setFile(name)
    setBody(await window.api.jobs.readFile(record.dir, name))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(1000px,92vw)]">
        <DialogHeader>
          <DialogTitle>{record.name}</DialogTitle>
          <DialogDescription>
            {record.framework} · generated {timeAgo(record.createdAt)}
            {job && ` · ${job.agent}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[15rem_1fr]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Files ({record.files.length})
              </span>
              <ScrollArea className="h-48 rounded-lg border border-border">
                <ul className="p-1">
                  {record.files.map((name) => (
                    <li key={name}>
                      <button
                        onClick={() => void openFile(name)}
                        className={`w-full truncate rounded px-2 py-1 text-left font-mono text-[11px] transition-colors ${
                          file === name
                            ? 'bg-brand/15 text-brand-bright'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                      >
                        {name}
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Built from
              </span>
              {sources.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  The source sections were deleted, but the job record still names them.
                </p>
              ) : (
                sources.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => window.api.browser.openExternal(section.url)}
                    className="flex items-center gap-2 rounded-lg border border-border p-1.5 text-left transition-colors hover:border-brand/50"
                  >
                    <img
                      src={window.api.library.url(section.file)}
                      alt=""
                      className="h-8 w-12 shrink-0 rounded object-cover object-top"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs">{section.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {section.host}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <ScrollArea className="h-[52vh] rounded-lg border border-border bg-[#08080a]">
            <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {file ? body || '(empty file)' : 'Pick a file to read it.'}
            </pre>
          </ScrollArea>
        </div>

        {checks.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Verification
              </span>
              {record.verified && (
                <Badge className="gap-1 bg-emerald-500/15 text-[10px] font-normal text-emerald-400">
                  <ShieldCheck className="size-2.5" />
                  {record.overridden ? 'Verified (overridden)' : 'Verified'}
                </Badge>
              )}
            </div>
            {checks.map((check) => {
              const Icon = CHECK_ICON[check.status]
              return (
                <div key={check.label} className="flex items-center gap-2 text-xs">
                  <Icon className={cn('size-3.5 shrink-0', CHECK_TINT[check.status])} />
                  <span className="w-12 shrink-0">{check.label}</span>
                  <code
                    title={check.output.slice(-1500) || check.command}
                    className="min-w-0 flex-1 truncate bg-transparent p-0 font-mono text-[10px] text-muted-foreground"
                  >
                    {check.status === 'pending' ? check.command : check.output.trim().split('\n').pop() || check.command}
                  </code>
                  {check.ms > 0 && (
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {(check.ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            disabled={!workspace || starting}
            onClick={() => void runPreview()}
            title={workspace ? 'Start the dev server and open it' : 'No workspace on this record'}
          >
            {starting ? <Loader2 className="size-4 animate-spin" /> : <MonitorPlay className="size-4" />}
            {preview?.running ? 'Open preview' : 'Preview'}
          </Button>
          <Button
            variant="secondary"
            disabled={!workspace || verifying || checks.length === 0}
            onClick={() => void runChecks()}
          >
            {verifying ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Run checks
          </Button>
          {!record.verified && checks.some((c) => c.status === 'failed') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await window.api.library.patch('components', record.id, {
                  verified: true,
                  overridden: true,
                  verifiedAt: Date.now()
                })
                await refresh()
                toast.message('Marked verified over a failing check')
              }}
            >
              Mark verified anyway
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.api.jobs.open(record.dir)}>
            <FolderOpen className="size-4" />
            Open workspace
          </Button>
          {file && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(body)
                  setCopied(true)
                  toast.success(`Copied ${file}`)
                  setTimeout(() => setCopied(false), 1400)
                }}
              >
                {copied ? (
                  <CheckIcon className="size-4 text-emerald-400" />
                ) : (
                  <Copy className="size-4" />
                )}
                Copy file
              </Button>
              <Button variant="secondary" onClick={() => window.api.jobs.open(record.dir, file)}>
                <FileCode2 className="size-4" />
                Open in editor
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Grid({ kind }: { kind: 'components' | 'templates' }): React.JSX.Element {
  const library = useLibrary()
  const remove = library.remove
  const rows = kind === 'components' ? library.components : library.templates
  const [open, setOpen] = useState<ComponentRecord | null>(null)

  return (
    <>
      <LibraryFrame
        icon={kind === 'components' ? Frame : LayoutTemplate}
        title={kind === 'components' ? 'Components' : 'Templates'}
        items={rows}
        search={(r) => `${r.name} ${r.framework}`}
        groupBy={{ label: 'Stack', of: (r) => r.framework }}
        nameOf={(r) => r.name}
        emptyTitle={kind === 'components' ? 'No components yet' : 'No templates yet'}
        emptyBlurb={
          kind === 'components'
            ? 'Save a section, open the AI tab in the inspector, choose a workspace and convert. What the agent writes lands here with a full trail back to the page it came from.'
            : 'Pick several saved sections, order them, and let the agent assemble them into one page. Templates keep every source they were built from.'
        }
      >
        {(shown) => (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4 p-5">
            {shown.map((record) => (
              <article
                key={record.id}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand/50"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <button onClick={() => setOpen(record)} className="block w-full text-left">
                      <p className="truncate text-sm font-medium">{record.name}</p>
                    </button>
                    <p className="truncate text-xs text-muted-foreground">
                      {record.files.length} file{record.files.length === 1 ? '' : 's'} ·{' '}
                      {timeAgo(record.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Open workspace"
                      onClick={() => window.api.jobs.open(record.dir)}
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete record"
                      className="hover:text-destructive"
                      onClick={() => void remove(kind, record.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {record.framework}
                  </Badge>
                  <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
                    <Link2 className="size-2.5" />
                    {record.sourceIds.length} source{record.sourceIds.length === 1 ? '' : 's'}
                  </Badge>
                  {record.verified && (
                    <Badge className="gap-1 bg-emerald-500/15 text-[10px] font-normal text-emerald-400">
                      <CheckCircle2 className="size-2.5" />
                      Verified
                    </Badge>
                  )}
                </div>

                <code className="truncate rounded bg-secondary/60 px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                  {record.files[0] ?? record.dir}
                </code>
              </article>
            ))}
          </div>
        )}
      </LibraryFrame>

      {open && <Detail record={open} onClose={() => setOpen(null)} />}
    </>
  )
}

export function Components(): React.JSX.Element {
  return <Grid kind="components" />
}

export function Templates(): React.JSX.Element {
  return <Grid kind="templates" />
}

export default Components

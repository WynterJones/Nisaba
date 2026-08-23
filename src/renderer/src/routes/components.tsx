import { useState } from 'react'
import {
  CheckCircle2,
  FileCode2,
  FolderOpen,
  Frame,
  LayoutTemplate,
  Link2,
  Trash2
} from 'lucide-react'
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

function Detail({
  record,
  onClose
}: {
  record: ComponentRecord
  onClose: () => void
}): React.JSX.Element {
  const { sections, jobs } = useLibrary()
  const [file, setFile] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const sources = sections.filter((s) => record.sourceIds.includes(s.id))
  const job = jobs.find((j) => j.id === record.jobId)

  const openFile = async (name: string): Promise<void> => {
    setFile(name)
    setBody(await window.api.jobs.readFile(record.dir, name))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[min(1000px,92vw)]">
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

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => window.api.jobs.open(record.dir)}>
            <FolderOpen className="size-4" />
            Open workspace
          </Button>
          {file && (
            <Button variant="secondary" onClick={() => window.api.jobs.open(record.dir, file)}>
              <FileCode2 className="size-4" />
              Open in editor
            </Button>
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
                    <button onClick={() => setOpen(record)} className="text-left">
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

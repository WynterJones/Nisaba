import { useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  CircleSlash,
  FileText,
  FolderOpen,
  Loader2,
  ListTodo,
  Trash2,
  XCircle
} from 'lucide-react'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
import { useLibrary } from '@/store'
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
import { CodeView } from '@/components/ui/code-view'
import type { JobRecord } from '../../../preload'

export const STATUS_ICON: Record<JobRecord['status'], typeof CheckCircle2> = {
  queued: Loader2,
  running: Loader2,
  done: CheckCircle2,
  failed: XCircle,
  cancelled: CircleSlash
}

export const STATUS_TINT: Record<JobRecord['status'], string> = {
  queued: 'text-muted-foreground',
  running: 'text-brand-bright animate-spin',
  done: 'text-emerald-500',
  failed: 'text-destructive',
  cancelled: 'text-muted-foreground'
}

/** Live log tail — the record holds history, the event stream holds what arrived since. */
export function useLiveLog(job: JobRecord | null): string {
  const [live, setLive] = useState('')

  useEffect(() => {
    setLive('')
    if (!job) return
    return window.api.jobs.onEvent(({ id, event }) => {
      if (id === job.id) setLive((current) => (current + event.text).slice(-40000))
    })
  }, [job?.id])

  const history = (job?.events ?? []).map((e) => e.text).join('')
  return history + live
}

function JobDetail({ job, onClose }: { job: JobRecord; onClose: () => void }): React.JSX.Element {
  const log = useLiveLog(job)
  const bottom = useRef<HTMLDivElement>(null)
  // Two selectors, not one that spreads: a selector returning a fresh array every call makes
  // zustand's snapshot never compare equal, which loops React until it tears the tree down.
  const components = useLibrary((s) => s.components)
  const templates = useLibrary((s) => s.templates)
  const produced =
    components.find((c) => c.jobId === job.id) ?? templates.find((t) => t.jobId === job.id)

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [log])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(900px,92vw)]">
        <DialogHeader>
          <DialogTitle>{job.title}</DialogTitle>
          <DialogDescription>
            {job.agent} · {job.profile} · started {timeAgo(job.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="log">
          <TabsList>
            <TabsTrigger value="log">Log</TabsTrigger>
            <TabsTrigger value="prompt">Resolved prompt</TabsTrigger>
            <TabsTrigger value="files">Files ({produced?.files.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="log">
            <ScrollArea className="h-[52vh] rounded-lg border border-border bg-[#08080a]">
              <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {log || 'No output yet.'}
                <div ref={bottom} />
              </pre>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="prompt">
            <div className="h-[52vh] overflow-hidden rounded-lg border border-border bg-[#08080a]">
              <CodeView value={job.prompt} filename="prompt.md" numbered={false} wrap />
            </div>
          </TabsContent>

          <TabsContent value="files">
            <ScrollArea className="h-[52vh]">
              {produced && produced.files.length > 0 ? (
                <ul className="flex flex-col gap-1 pr-3">
                  {produced.files.map((file) => (
                    <li key={file} className="flex items-center gap-2">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <button
                        onClick={() => window.api.jobs.open(produced.dir, file)}
                        className="min-w-0 flex-1 truncate text-left font-mono text-xs text-muted-foreground hover:text-foreground"
                      >
                        {file}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Reveal"
                        onClick={() => window.api.jobs.reveal(produced.dir, file)}
                      >
                        <FolderOpen className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  This run did not change any files.
                </p>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-secondary/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            {job.command}
          </code>
          {job.status === 'running' ? (
            <Button variant="destructive" onClick={() => window.api.jobs.cancel(job.id)}>
              Cancel run
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => window.api.jobs.open(job.outputDir)}>
              <FolderOpen className="size-4" />
              Open workspace
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function Jobs(): React.JSX.Element {
  const { jobs, remove, refresh } = useLibrary()
  const [open, setOpen] = useState<JobRecord | null>(null)

  useEffect(() => window.api.jobs.onDone(() => void refresh()), [refresh])

  return (
    <>
      <LibraryFrame
        icon={ListTodo}
        title="Jobs"
        items={jobs}
        search={(j) => `${j.title} ${j.agent} ${j.profile} ${j.status}`}
        groupBy={{ label: 'Status', of: (j) => j.status }}
        nameOf={(j) => j.title}
        emptyTitle="No jobs yet"
        emptyBlurb="Extract a section, pick a workspace, and convert it. Every run keeps its resolved prompt, its command, its full log and the files it produced."
      >
        {(rows) => (
          <ul className="divide-y divide-border">
            {rows.map((job) => {
              const Icon = STATUS_ICON[job.status]
              return (
                <li
                  key={job.id}
                  className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40"
                >
                  <Icon className={cn('size-4 shrink-0', STATUS_TINT[job.status])} />
                  <button onClick={() => setOpen(job)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{job.title}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {job.command}
                    </span>
                  </button>
                  <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
                    {job.agent}
                  </Badge>
                  <span className="shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
                    {job.status} · {timeAgo(job.createdAt)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Open workspace"
                      onClick={() => window.api.jobs.open(job.outputDir)}
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete record"
                      className="hover:text-destructive"
                      onClick={() => void remove('jobs', job.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </LibraryFrame>

      {open && (
        <JobDetail
          job={jobs.find((j) => j.id === open.id) ?? open}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  )
}

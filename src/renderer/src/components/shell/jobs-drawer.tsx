import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { ChevronUp, FolderOpen, ScrollText, X } from 'lucide-react'
import { useApp, useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import { STATUS_ICON, STATUS_TINT } from '@/routes/jobs'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

/**
 * A CLI agent gives no percentage, so "progress" here is a paced indeterminate bar —
 * it says *working*, not *this far through*. The real signal is the log line beside it.
 */
function LiveBar(): React.JSX.Element {
  return (
    <div className="relative h-1.5 w-56 shrink-0 overflow-hidden rounded-full bg-primary/15">
      <div className="progress-stripes absolute inset-y-0 w-full rounded-full bg-gradient-to-r from-brand to-brand-bright" />
    </div>
  )
}

export function JobsDrawer(): React.JSX.Element {
  const { jobsOpen, setJobsOpen } = useApp()
  const { jobs, refresh, remove } = useLibrary()
  const navigate = useNavigate()

  useEffect(() => window.api.jobs.onDone(() => void refresh()), [refresh])

  const recent = jobs.slice(0, 4)
  const running = jobs.filter((j) => j.status === 'running')

  return (
    <div className="relative z-10 shrink-0 border-t border-border bg-sidebar shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.8)]">
      <div className="flex h-11 items-center gap-3 px-3">
        <button
          onClick={() => setJobsOpen(!jobsOpen)}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          Tasks
          {running.length > 0 && (
            <span className="grid size-4 place-items-center rounded bg-brand text-[10px] font-bold text-primary-foreground">
              {running.length}
            </span>
          )}
          <ChevronUp className={cn('size-3.5 transition-transform', jobsOpen && 'rotate-180')} />
        </button>

        {!jobsOpen && recent.length > 0 && (
          <span className="truncate text-xs text-muted-foreground">
            {recent[0].agent} · {recent[0].title} · {recent[0].status}
          </span>
        )}

        {jobs.length > 0 && (
          <button
            onClick={() => navigate('/jobs')}
            className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            All jobs
          </button>
        )}
      </div>

      {jobsOpen && (
        <div className="flex flex-col gap-1 px-3 pb-3">
          {recent.length === 0 && (
            <p className="py-3 text-xs text-muted-foreground">
              Nothing running — the fox is napping. Convert a section to wake it up.
            </p>
          )}
          {recent.map((job) => {
            const Icon = STATUS_ICON[job.status]
            const last = [...job.events].reverse().find((e) => e.text.trim())
            return (
              <div
                key={job.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/60 px-3 py-2"
              >
                <Icon className={cn('size-4 shrink-0', STATUS_TINT[job.status])} />
                <span className="shrink-0 text-sm font-medium">{job.agent}</span>
                <span className="shrink-0 text-muted-foreground">·</span>
                <button
                  onClick={() => navigate('/jobs')}
                  className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground hover:text-foreground"
                >
                  {job.status === 'running'
                    ? (last?.text.trim().split('\n').pop() ?? job.title)
                    : job.title}
                </button>

                {job.status === 'running' ? (
                  <LiveBar />
                ) : (
                  <Progress
                    value={100}
                    className={cn(
                      'h-1.5 w-56 shrink-0',
                      job.status !== 'done' && 'opacity-40 grayscale'
                    )}
                  />
                )}

                <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                  {job.status}
                </span>

                {job.status === 'running' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => window.api.jobs.cancel(job.id)}
                  >
                    Cancel
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      onClick={() => navigate('/jobs')}
                    >
                      <ScrollText className="size-3.5" />
                      Logs
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      title="Open workspace"
                      onClick={() => window.api.jobs.open(job.outputDir)}
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                  </>
                )}

                <button
                  onClick={() => void remove('jobs', job.id)}
                  className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Dismiss job"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { CheckCircle2, ChevronUp, Loader2, ScrollText, X, XCircle } from 'lucide-react'
import { useApp } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export function JobsDrawer(): React.JSX.Element {
  const { jobs, jobsOpen, setJobsOpen, dismissJob } = useApp()
  const running = jobs.filter((j) => j.status === 'running').length

  return (
    <div className="relative z-10 shrink-0 border-t border-border bg-sidebar shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.8)]">
      <div className="flex h-11 items-center gap-3 px-3">
        <button
          onClick={() => setJobsOpen(!jobsOpen)}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          Tasks
          {running > 0 && (
            <span className="grid size-4 place-items-center rounded bg-brand text-[10px] font-bold text-primary-foreground">
              {running}
            </span>
          )}
          <ChevronUp className={cn('size-3.5 transition-transform', jobsOpen && 'rotate-180')} />
        </button>

        {!jobsOpen && running > 0 && (
          <span className="truncate text-xs text-muted-foreground">
            {jobs[0].agent} · {jobs[0].label}
          </span>
        )}
      </div>

      {jobsOpen && (
        <div className="flex flex-col gap-1 px-3 pb-3">
          {jobs.length === 0 && (
            <p className="py-3 text-xs text-muted-foreground">
              Nothing running — the fox is napping. Convert a section to wake it up.
            </p>
          )}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background/60 px-3 py-2"
            >
              {job.status === 'running' ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-brand-bright" />
              ) : job.status === 'done' ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="size-4 shrink-0 text-destructive" />
              )}
              <span className="shrink-0 text-sm font-medium">{job.agent}</span>
              <span className="shrink-0 text-muted-foreground">·</span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {job.label}
              </span>
              <Progress value={job.progress} className="h-1.5 w-56 shrink-0" />
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {job.progress}%
              </span>
              <Button variant="secondary" size="sm" className="shrink-0">
                <ScrollText className="size-3.5" />
                Logs
              </Button>
              <button
                onClick={() => dismissJob(job.id)}
                className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Dismiss job"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

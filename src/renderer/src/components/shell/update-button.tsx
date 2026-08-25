import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Download, Loader2, RefreshCw, RotateCw } from 'lucide-react'
import { useApp } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import type { UpdateState } from '../../../../preload'

/**
 * Sits at the foot of the sidebar. Clicking it opens one dialog that walks the whole update
 * through in place — checking, downloading with a real progress bar, then restarting — so a
 * single click is enough and nothing looks stalled while it works.
 */
export function UpdateButton({ collapsed }: { collapsed: boolean }): React.JSX.Element | null {
  const [state, setState] = useState<UpdateState | null>(null)
  const [open, setOpen] = useState(false)
  const setOverlay = useApp((s) => s.setOverlay)

  useEffect(() => {
    void window.api.update.state().then(setState)
    return window.api.update.onState(setState)
  }, [])

  if (!state) return null

  const offerable = state.status === 'available' || state.status === 'ready'

  const show = (): void => {
    setOverlay(true)
    setOpen(true)
    // Nothing known yet? Start the check the dialog is about to report on.
    if (state.status === 'idle' || state.status === 'none' || state.status === 'error') {
      void window.api.update.check()
    }
  }

  const hide = (): void => {
    setOverlay(false)
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={show}
        title={state.supported ? 'Check for updates' : 'Updates apply to the packaged app'}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
          offerable
            ? 'btn-raised btn-raised--primary font-medium text-primary-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
          collapsed && 'justify-center px-0'
        )}
      >
        {offerable ? (
          <Download className="size-3.5 shrink-0" />
        ) : (
          <RefreshCw className={cn('size-3.5 shrink-0', state.status === 'checking' && 'animate-spin')} />
        )}
        {!collapsed && (
          <span className="truncate">
            {offerable ? `Update to ${state.version ?? 'the latest'}` : 'Check for updates'}
          </span>
        )}
      </button>

      {open && <UpdateDialog state={state} onClose={hide} />}
    </>
  )
}

function UpdateDialog({
  state,
  onClose
}: {
  state: UpdateState
  onClose: () => void
}): React.JSX.Element {
  const version = state.version ?? 'the latest version'
  const busy = state.status === 'downloading' || state.status === 'restarting'

  const step = ((): { title: string; body: string; icon: React.JSX.Element } => {
    switch (state.status) {
      case 'checking':
        return {
          title: 'Checking for updates…',
          body: 'Asking the release feed what the newest version is.',
          icon: <Loader2 className="size-5 animate-spin text-brand-bright" />
        }
      case 'available':
        return {
          title: `Version ${version} is available`,
          body: state.notes
            ? 'Here is what changed. Download it and restart to finish.'
            : 'Download it and restart to finish.',
          icon: <Download className="size-5 text-brand-bright" />
        }
      case 'downloading':
        return {
          title: `Downloading ${version}…`,
          body: 'Nisaba stays usable while this runs. You will be asked to restart when it lands.',
          icon: <Loader2 className="size-5 animate-spin text-brand-bright" />
        }
      case 'ready':
        return {
          title: `Version ${version} is ready`,
          body: 'Restarting takes a few seconds and reopens Nisaba on the new version.',
          icon: <Check className="size-5 text-emerald-500" />
        }
      case 'restarting':
        return {
          title: 'Restarting…',
          body: 'Nisaba is closing and will reopen on the new version.',
          icon: <Loader2 className="size-5 animate-spin text-brand-bright" />
        }
      case 'error':
        return {
          title: 'Update failed',
          body: state.error ?? 'Something went wrong talking to the release feed.',
          icon: <AlertTriangle className="size-5 text-destructive" />
        }
      default:
        return {
          title: state.supported ? 'Nisaba is up to date' : 'Updates apply to the packaged app',
          body: state.supported
            ? 'You are on the newest release.'
            : 'A development build has no packaged app to replace.',
          icon: <Check className="size-5 text-emerald-500" />
        }
    }
  })()

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-start gap-2.5">
              <span className="mt-px shrink-0">{step.icon}</span>
              {step.title}
            </span>
          </DialogTitle>
          <DialogDescription className="whitespace-pre-wrap">{step.body}</DialogDescription>
        </DialogHeader>

        {(state.status === 'available' || state.status === 'ready') && (
          <ReleaseNotes notes={state.notes} />
        )}

        {state.status === 'downloading' && (
          <div className="flex flex-col gap-1.5">
            <Progress value={state.percent} />
            <span className="text-right font-mono text-[11px] text-muted-foreground">
              {state.percent}%
            </span>
          </div>
        )}

        <DialogFooter>
          {!busy && (
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
          {state.status === 'available' && (
            <Button onClick={() => void window.api.update.download()}>
              <Download className="size-4" />
              Download
            </Button>
          )}
          {state.status === 'ready' && (
            <Button onClick={() => void window.api.update.install()}>
              <RotateCw className="size-4" />
              Restart now
            </Button>
          )}
          {(state.status === 'error' || state.status === 'none') && state.supported && (
            <Button onClick={() => void window.api.update.check()}>
              <RefreshCw className="size-4" />
              Check again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Release notes arrive as GitHub's rendered HTML. Rather than ship a sanitiser, the block
 * tags become line breaks and everything else is dropped — what is left is the changelog.
 */
function ReleaseNotes({ notes }: { notes?: string | null }): React.JSX.Element | null {
  const lines = (notes ?? '')
    .replace(/<\/(?:li|p|h\d|div|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_, e) =>
      ({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e as string] ?? ' '
    )
    .split('\n')
    .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
    .filter(Boolean)

  if (lines.length === 0) return null

  return (
    <ul className="max-h-56 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-3 text-sm">
      {lines.map((line, i) => (
        <li key={i} className="flex gap-2 py-0.5 text-muted-foreground">
          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-brand-bright" />
          <span className="min-w-0 flex-1">{line}</span>
        </li>
      ))}
    </ul>
  )
}

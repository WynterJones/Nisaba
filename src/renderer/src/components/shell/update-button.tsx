import { useEffect, useState } from 'react'
import { Check, Download, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { UpdateState } from '../../../../preload'

/**
 * Sits at the foot of the sidebar and only speaks up when there is something to say:
 * an update to fetch, or one already downloaded and waiting for a restart.
 */
export function UpdateButton({ collapsed }: { collapsed: boolean }): React.JSX.Element | null {
  const [state, setState] = useState<UpdateState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.update.state().then(setState)
    return window.api.update.onState(setState)
  }, [])

  if (!state) return null

  const install = async (): Promise<void> => {
    setBusy(true)
    try {
      // Downloads if needed, then restarts into the new version.
      await window.api.update.install()
    } finally {
      setBusy(false)
    }
  }

  const check = async (): Promise<void> => {
    setBusy(true)
    const next = await window.api.update.check()
    setBusy(false)
    if (next.status === 'none') toast.success('Nisaba is up to date')
    if (next.status === 'error') toast.error(next.error ?? 'Could not check for updates')
  }

  const offerable = state.status === 'available' || state.status === 'ready'
  const working = busy || state.status === 'downloading'

  // Nothing to offer and nothing in flight: keep a quiet manual check instead of a banner.
  if (!offerable && !working) {
    return (
      <button
        onClick={() => void check()}
        title={state.supported ? 'Check for updates' : 'Updates apply to the packaged app'}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
          collapsed && 'justify-center px-0'
        )}
      >
        <RefreshCw className={cn('size-3.5 shrink-0', state.status === 'checking' && 'animate-spin')} />
        {!collapsed && <span>Check for updates</span>}
      </button>
    )
  }

  return (
    <button
      onClick={() => void install()}
      disabled={working}
      title={
        state.status === 'ready'
          ? `Restart into ${state.version}`
          : `Download and install ${state.version}`
      }
      className={cn(
        'btn-raised btn-raised--primary flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary-foreground',
        collapsed && 'justify-center px-0'
      )}
    >
      {working ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      ) : state.status === 'ready' ? (
        <Check className="size-3.5 shrink-0" />
      ) : (
        <Download className="size-3.5 shrink-0" />
      )}
      {!collapsed && (
        <span className="truncate">
          {state.status === 'downloading'
            ? `Downloading ${state.percent}%`
            : state.status === 'ready'
              ? `Restart to update`
              : `Update to ${state.version}`}
        </span>
      )}
    </button>
  )
}

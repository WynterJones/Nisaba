import { ChevronDown, Terminal } from 'lucide-react'
import { useAgents } from '@/agents'
import { useApp } from '@/store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { AgentInstallation } from '../../../../preload'

/**
 * Any button that hands work to an agent: the flyout lists every CLI Nisaba knows, with the
 * ones missing from this machine greyed out rather than hidden, so it is obvious why.
 */
export function AgentMenu({
  children,
  onPick,
  disabled,
  title,
  variant = 'secondary',
  className,
  size
}: {
  children: React.ReactNode
  onPick: (agent: AgentInstallation) => void
  disabled?: boolean
  title?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  className?: string
  size?: React.ComponentProps<typeof Button>['size']
}): React.JSX.Element {
  const agents = useAgents()
  // Native views paint over all renderer HTML, so the page has to go while the menu is open.
  const setOverlay = useApp((s) => s.setOverlay)
  const installed = agents?.filter((a) => a.path) ?? []

  return (
    <DropdownMenu onOpenChange={setOverlay}>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className} disabled={disabled} title={title}>
          {children}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground">
          {agents === null
            ? 'Looking for installed CLIs…'
            : installed.length === 0
              ? 'No agent CLI found on this machine'
              : 'Run with'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(agents ?? []).map((agent) => (
          <DropdownMenuItem
            key={agent.id}
            disabled={!agent.path}
            onSelect={() => onPick(agent)}
            className="gap-2"
          >
            <Terminal className={agent.path ? 'text-emerald-500' : 'opacity-40'} />
            <span className="flex-1">{agent.label}</span>
            <span className="max-w-24 truncate text-[10px] text-muted-foreground">
              {agent.path ? (agent.version ?? 'installed') : 'not installed'}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

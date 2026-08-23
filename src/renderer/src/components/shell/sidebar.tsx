import { NavLink, useLocation, useNavigate } from 'react-router'
import { ChevronRight, ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV, SYSTEM, isFlyout, type NavFlyout } from '@/nav'
import { useApp } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'

function NavRow({
  to,
  label,
  icon: Icon,
  collapsed
}: {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  collapsed: boolean
}): React.JSX.Element {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
          'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
          isActive && 'bg-sidebar-accent text-foreground',
          collapsed && 'justify-center px-0'
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute left-0 h-4 w-0.5 rounded-r-full bg-brand-bright transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0'
            )}
          />
          <Icon
            className={cn(
              'size-4 shrink-0 transition-transform duration-150 group-hover:-translate-y-px group-hover:scale-110',
              isActive && 'text-brand-bright drop-shadow-[0_0_6px_var(--brand-bright)]'
            )}
          />
          {!collapsed && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  )
}

/** One sidebar row that opens a shelf of related screens. */
function Flyout({
  flyout,
  collapsed
}: {
  flyout: NavFlyout
  collapsed: boolean
}): React.JSX.Element {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const active = flyout.items.some((item) => item.to === pathname)
  const Icon = flyout.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title={collapsed ? flyout.label : undefined}
          className={cn(
            'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
            'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
            active && 'bg-sidebar-accent text-foreground',
            collapsed && 'justify-center px-0'
          )}
        >
          <span
            className={cn(
              'absolute left-0 h-4 w-0.5 rounded-r-full bg-brand-bright transition-opacity',
              active ? 'opacity-100' : 'opacity-0'
            )}
          />
          <Icon
            className={cn(
              'size-4 shrink-0 transition-transform duration-150 group-hover:-translate-y-px group-hover:scale-110',
              active && 'text-brand-bright drop-shadow-[0_0_6px_var(--brand-bright)]'
            )}
          />
          {!collapsed && (
            <>
              <span className="truncate">{flyout.label}</span>
              <ChevronRight className="ml-auto size-3.5 opacity-50" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-60">
        <DropdownMenuLabel>{flyout.label}</DropdownMenuLabel>
        {flyout.items.map((item) => (
          <DropdownMenuItem key={item.to} onSelect={() => navigate(item.to)}>
            <item.icon className={cn(pathname === item.to && 'text-brand-bright')} />
            <span className="flex-1">{item.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Sidebar(): React.JSX.Element {
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const toggle = useApp((s) => s.toggleSidebar)
  const navigate = useNavigate()

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-[228px]'
      )}
    >
      {/* Reserves the macOS traffic-light strip and gives the window a drag handle. */}
      <div className="drag-region h-[52px] shrink-0" />

      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-4 px-2 pb-3">
          {NAV.map((group, i) => (
            <div key={group.label ?? i} className="flex flex-col gap-0.5">
              {group.label && !collapsed && (
                <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
              )}
              {group.entries.map((entry) =>
                isFlyout(entry) ? (
                  <Flyout key={entry.key} flyout={entry} collapsed={collapsed} />
                ) : (
                  <NavRow key={entry.to} {...entry} collapsed={collapsed} />
                )
              )}
            </div>
          ))}

        </nav>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title="Workspace, settings"
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-sidebar-accent',
                collapsed && 'justify-center'
              )}
            >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand text-sm font-semibold text-primary-foreground">
            W
          </span>
          {!collapsed && (
            <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">Workspace</span>
                    <span className="block truncate text-xs text-brand-bright">Local library</span>
                  </span>
                  <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            {SYSTEM.map((item) => (
              <DropdownMenuItem key={item.to} onSelect={() => navigate(item.to)}>
                <item.icon />
                <span className="flex-1">{item.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className={cn('mt-1 w-full justify-start text-muted-foreground', collapsed && 'justify-center px-0')}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && <span>Collapse</span>}
        </Button>
      </div>
    </aside>
  )
}

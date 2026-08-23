import { NavLink } from 'react-router'
import { ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV } from '@/nav'
import { useApp } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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

export function Sidebar(): React.JSX.Element {
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const toggle = useApp((s) => s.toggleSidebar)

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
              {group.items.map((item) => (
                <NavRow key={item.to} {...item} collapsed={collapsed} />
              ))}
            </div>
          ))}

        </nav>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <button
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

import { useState } from 'react'
import { useNavigate } from 'react-router'
import { LayoutGrid, ListFilter, Rows3, Search } from 'lucide-react'
import type { NavItem } from '@/nav'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * One route component for every typed library (Captures, Sections, Elements, …).
 * The views only differ by their copy until Phase 4's repositories exist.
 */
export default function LibraryRoute({ item }: { item: NavItem }): React.JSX.Element {
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const navigate = useNavigate()
  const Icon = item.icon

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-5">
        <Icon className="size-4 text-brand-bright" />
        <h1 className="text-sm font-semibold">{item.label}</h1>
        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200/80">
          Not built yet
        </span>

        <div className="ml-4 flex h-8 min-w-0 max-w-sm flex-1 items-center gap-2 rounded-lg border border-input bg-secondary/50 px-3 focus-within:border-brand-bright">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            placeholder={`Search ${item.label.toLowerCase()}`}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm">
            <ListFilter className="size-3.5" />
            Filter
          </Button>
          <div className="flex items-center rounded-lg border border-border bg-secondary/40 p-0.5">
            {(
              [
                ['grid', LayoutGrid],
                ['table', Rows3]
              ] as const
            ).map(([mode, ModeIcon]) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                aria-label={`${mode} view`}
                className={cn(
                  'grid size-7 place-items-center rounded-md transition-colors',
                  view === mode
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <ModeIcon className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="grid size-14 place-items-center rounded-2xl border border-border bg-secondary/40">
          <Icon className="size-6 text-muted-foreground" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-medium">{item.label}</h2>
          {item.blurb && <p className="max-w-sm text-sm text-muted-foreground">{item.blurb}</p>}
          <p className="max-w-sm text-xs text-muted-foreground/70">
            This screen is specified but not implemented yet. Captures, Sections, Sites and
            Bookmarks are live today.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => navigate('/captures')}>
          See what is working
        </Button>
      </div>
    </div>
  )
}

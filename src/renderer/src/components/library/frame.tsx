import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { LayoutGrid, ListFilter, Rows3, Search, type LucideIcon } from 'lucide-react'
import { useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

export type View = 'grid' | 'table'

export function LibraryFrame<T>({
  icon: Icon,
  title,
  items,
  search,
  emptyTitle,
  emptyBlurb,
  actions,
  children
}: {
  icon: LucideIcon
  title: string
  items: T[]
  /** Returns the haystack a row is matched against. */
  search: (item: T) => string
  emptyTitle: string
  emptyBlurb: string
  actions?: React.ReactNode
  children: (shown: T[], view: View) => React.ReactNode
}): React.JSX.Element {
  const [view, setView] = useState<View>('grid')
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  // The library lives on disk; re-read it whenever one of these screens is opened.
  useEffect(() => {
    void useLibrary.getState().refresh()
  }, [])

  const shown = query
    ? items.filter((item) => search(item).toLowerCase().includes(query.toLowerCase()))
    : items

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-5">
        <Icon className="size-4 text-brand-bright" />
        <h1 className="text-sm font-semibold">{title}</h1>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
          {items.length}
        </span>

        <div className="ml-4 flex h-8 min-w-0 max-w-sm flex-1 items-center gap-2 rounded-lg border border-input bg-secondary/50 px-3 focus-within:border-brand-bright">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {actions}
          <Button variant="ghost" size="sm" disabled title="Saved filters arrive with collections">
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
                title={`${mode} view`}
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

      {items.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="grid size-14 place-items-center rounded-2xl border border-border bg-secondary/40">
            <Icon className="size-6 text-muted-foreground" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-medium">{emptyTitle}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">{emptyBlurb}</p>
          </div>
          <Button size="sm" onClick={() => navigate('/browse')}>
            Start browsing
          </Button>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {children(shown, view)}
          {shown.length === 0 && (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          )}
        </ScrollArea>
      )}
    </div>
  )
}

export function timeAgo(at: number): string {
  const seconds = Math.round((Date.now() - at) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(at).toLocaleDateString()
}

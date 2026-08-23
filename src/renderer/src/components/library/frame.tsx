import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowDownUp,
  Check,
  LayoutGrid,
  ListFilter,
  Rows3,
  Search,
  Tag,
  type LucideIcon
} from 'lucide-react'
import { Backdrop } from '@/components/canvas/backdrop'
import { useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'

export type View = 'grid' | 'table'
export type Sort = 'newest' | 'oldest' | 'name'

export function LibraryFrame<T extends { createdAt: number }>({
  icon: Icon,
  title,
  items,
  search,
  emptyTitle,
  emptyBlurb,
  actions,
  views = ['grid'],
  groupBy,
  tagsOf,
  nameOf,
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
  /** Views this route actually implements — the toggle only appears when there are two. */
  views?: View[]
  /** Enables the Filter control; usually the source site. */
  groupBy?: { label: string; of: (item: T) => string }
  /** Enables tag filtering in the Filter menu. */
  tagsOf?: (item: T) => string[]
  /** Enables sorting by name. */
  nameOf?: (item: T) => string
  children: (shown: T[], view: View) => React.ReactNode
}): React.JSX.Element {
  const [view, setView] = useState<View>(views[0])
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>('newest')
  const navigate = useNavigate()

  // The library lives on disk; re-read it whenever one of these screens is opened.
  useEffect(() => {
    void useLibrary.getState().refresh()
  }, [])

  const groups = useMemo(() => {
    if (!groupBy) return []
    const counts = new Map<string, number>()
    for (const item of items) {
      const key = groupBy.of(item)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [items, groupBy])

  const tagCounts = useMemo(() => {
    if (!tagsOf) return []
    const counts = new Map<string, number>()
    for (const item of items) {
      for (const tag of tagsOf(item)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [items, tagsOf])

  const shown = useMemo(() => {
    let rows = items
    if (query) rows = rows.filter((item) => search(item).toLowerCase().includes(query.toLowerCase()))
    if (group && groupBy) rows = rows.filter((item) => groupBy.of(item) === group)
    // Several tags read as "any of these", which is what people expect from chips.
    if (tags.length > 0 && tagsOf) {
      rows = rows.filter((item) => tagsOf(item).some((tag) => tags.includes(tag)))
    }
    const sorted = [...rows]
    if (sort === 'oldest') sorted.sort((a, b) => a.createdAt - b.createdAt)
    else if (sort === 'name' && nameOf) sorted.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    else sorted.sort((a, b) => b.createdAt - a.createdAt)
    return sorted
  }, [items, query, group, sort, tags])

  const filtering = Boolean(group) || tags.length > 0 || sort !== 'newest'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-5">
        <Icon className="size-4 text-brand-bright" />
        <h1 className="text-sm font-semibold">{title}</h1>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
          {shown.length === items.length ? items.length : `${shown.length}/${items.length}`}
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

          {(groupBy || nameOf || tagsOf) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(filtering && 'text-brand-bright')}
                  title="Filter and sort"
                >
                  <ListFilter className="size-3.5" />
                  {group ?? (tags.length > 0 ? `${tags.length} tag${tags.length === 1 ? '' : 's'}` : 'Filter')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-auto">
                <DropdownMenuLabel className="flex items-center gap-1.5">
                  <ArrowDownUp className="size-3" />
                  Sort
                </DropdownMenuLabel>
                {(
                  [
                    ['newest', 'Newest first'],
                    ['oldest', 'Oldest first'],
                    ...(nameOf ? ([['name', 'By name']] as const) : [])
                  ] as [Sort, string][]
                ).map(([id, label]) => (
                  <DropdownMenuItem key={id} onSelect={() => setSort(id)}>
                    <Check className={cn('size-3.5', sort !== id && 'opacity-0')} />
                    {label}
                  </DropdownMenuItem>
                ))}

                {tagsOf && tagCounts.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="flex items-center gap-1.5">
                      <Tag className="size-3" />
                      Tags
                    </DropdownMenuLabel>
                    {tags.length > 0 && (
                      <DropdownMenuItem onSelect={() => setTags([])}>
                        <Check className="size-3.5 opacity-0" />
                        Clear tag filter
                      </DropdownMenuItem>
                    )}
                    {tagCounts.map(([tag, count]) => (
                      <DropdownMenuItem
                        key={tag}
                        // Keep the menu open so several tags can be picked in one go.
                        onSelect={(e) => {
                          e.preventDefault()
                          setTags((current) =>
                            current.includes(tag)
                              ? current.filter((t) => t !== tag)
                              : [...current, tag]
                          )
                        }}
                      >
                        <Check className={cn('size-3.5', !tags.includes(tag) && 'opacity-0')} />
                        <span className="min-w-0 flex-1 truncate">{tag}</span>
                        <span className="text-xs text-muted-foreground">{count}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}

                {groupBy && groups.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{groupBy.label}</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => setGroup(null)}>
                      <Check className={cn('size-3.5', group !== null && 'opacity-0')} />
                      All
                    </DropdownMenuItem>
                    {groups.map(([key, count]) => (
                      <DropdownMenuItem key={key} onSelect={() => setGroup(key)}>
                        <Check className={cn('size-3.5', group !== key && 'opacity-0')} />
                        <span className="min-w-0 flex-1 truncate">{key}</span>
                        <span className="text-xs text-muted-foreground">{count}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {views.length > 1 && (
            <div className="flex items-center rounded-lg border border-border bg-secondary/40 p-0.5">
              {(
                [
                  ['grid', LayoutGrid],
                  ['table', Rows3]
                ] as const
              ).map(([mode, ModeIcon]) =>
                views.includes(mode) ? (
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
                ) : null
              )}
            </div>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <Backdrop>
          <div className="flex flex-col items-center gap-4 p-8 text-center">
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
        </Backdrop>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {children(shown, view)}
          {shown.length === 0 && (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              Nothing matches {query ? `“${query}”` : 'that filter'}.
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

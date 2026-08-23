import { useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import type { Collection } from '../../../../preload'

/** Every tag already in use, so the same label doesn't get typed three different ways. */
export function useAllTags(): string[] {
  const { captures, sections } = useLibrary()
  return useMemo(() => {
    const seen = new Set<string>()
    for (const record of [...captures, ...sections]) {
      for (const tag of record.tags ?? []) seen.add(tag)
    }
    return [...seen].sort()
  }, [captures, sections])
}

export function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32)
}

export function TagEditor({
  collection,
  id,
  tags,
  className
}: {
  collection: Collection
  id: string
  tags: string[]
  className?: string
}): React.JSX.Element {
  const refresh = useLibrary((s) => s.refresh)
  const known = useAllTags()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const save = async (next: string[]): Promise<void> => {
    await window.api.library.patch(collection, id, { tags: next })
    await refresh()
  }

  const add = async (raw: string): Promise<void> => {
    const tag = normalizeTag(raw)
    setDraft('')
    if (!tag || tags.includes(tag)) return
    await save([...tags, tag])
  }

  const suggestions = draft
    ? known.filter((t) => t.includes(normalizeTag(draft)) && !tags.includes(t)).slice(0, 5)
    : []

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="group/tag flex items-center gap-1 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand-bright"
        >
          {tag}
          <button
            onClick={(e) => {
              e.stopPropagation()
              void save(tags.filter((t) => t !== tag))
            }}
            aria-label={`Remove ${tag}`}
            className="opacity-0 transition-opacity group-hover/tag:opacity-100 hover:text-foreground"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}

      {adding ? (
        <span className="relative">
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') void add(draft)
              if (e.key === 'Escape' || (e.key === 'Backspace' && !draft)) {
                setAdding(false)
                setDraft('')
              }
            }}
            onBlur={() => {
              if (draft.trim()) void add(draft)
              setAdding(false)
            }}
            placeholder="tag…"
            className="w-24 rounded border border-input bg-secondary/60 px-1.5 py-0.5 text-[10px] outline-none focus:border-brand-bright"
          />
          {suggestions.length > 0 && (
            <span className="absolute left-0 top-full z-20 mt-1 flex min-w-24 flex-col rounded border border-border bg-popover p-0.5 shadow-lg">
              {suggestions.map((tag) => (
                <button
                  key={tag}
                  // onBlur would fire first and swallow the click.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    void add(tag)
                  }}
                  className="rounded px-1.5 py-0.5 text-left text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {tag}
                </button>
              ))}
            </span>
          )}
        </span>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setAdding(true)
          }}
          title="Add a tag"
          className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-2.5" />
          Tag
        </button>
      )}
    </div>
  )
}

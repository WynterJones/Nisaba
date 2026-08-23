import { useState } from 'react'
import { Blocks, ExternalLink, Trash2 } from 'lucide-react'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
import { useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ElementRecord } from '../../../preload'

/** One saved primitive plus every interaction state Nisaba could capture for it. */
function ElementCard({ record }: { record: ElementRecord }): React.JSX.Element {
  const remove = useLibrary((s) => s.remove)
  const [state, setState] = useState<string>('default')

  const frames = [{ state: 'default', file: record.file }, ...record.states]
  const shown = frames.find((f) => f.state === state) ?? frames[0]

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-brand/50">
      <div className="grid min-h-24 place-items-center overflow-auto bg-[repeating-conic-gradient(#17171b_0%_25%,#121214_0%_50%)] bg-[length:16px_16px] p-4">
        <img
          src={window.api.library.url(shown.file)}
          alt={record.label}
          loading="lazy"
          className="max-w-full"
        />
      </div>

      {frames.length > 1 && (
        <div className="flex flex-wrap gap-1 border-t border-border px-2 py-1.5">
          {frames.map((frame) => (
            <button
              key={frame.state}
              onClick={() => setState(frame.state)}
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors',
                shown.state === frame.state
                  ? 'bg-brand/20 text-brand-bright'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              :{frame.state}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 border-t border-border p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{record.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {record.host} · {timeAgo(record.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Open source page"
            onClick={() => window.api.browser.openExternal(record.url)}
          >
            <ExternalLink className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Delete"
            className="hover:text-destructive"
            onClick={() => void remove('elements', record.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </article>
  )
}

export default function Elements(): React.JSX.Element {
  const elements = useLibrary((s) => s.elements)
  const [category, setCategory] = useState<string | null>(null)

  const categories = [...new Set(elements.map((e) => e.category))].sort()
  const shown = category ? elements.filter((e) => e.category === category) : elements

  return (
    <LibraryFrame
      icon={Blocks}
      title="Elements"
      items={shown}
      search={(e) => `${e.label} ${e.category} ${e.host} ${e.text}`}
      emptyTitle="No elements yet"
      emptyBlurb="Open a page in Browse and run Detect elements from the Capture menu. Nisaba finds the buttons, inputs, cards and badges, screenshots each one with its hover and focus states, and files them by category."
      groupBy={{ label: 'Site', of: (e) => e.host }}
      nameOf={(e) => e.label}
      actions={
        categories.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCategory(null)}
              className={cn(
                'rounded-md px-2 py-1 text-xs transition-colors',
                category === null
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs transition-colors',
                  category === c
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )
      }
    >
      {(rows) => (
        <div className="flex flex-col gap-6 p-5">
          {[...new Set(rows.map((r) => r.category))].map((group) => (
            <section key={group} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{group}</h2>
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {rows.filter((r) => r.category === group).length} across{' '}
                  {new Set(rows.filter((r) => r.category === group).map((r) => r.host)).size} site(s)
                </Badge>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
                {rows
                  .filter((r) => r.category === group)
                  .map((record) => (
                    <ElementCard key={record.id} record={record} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </LibraryFrame>
  )
}

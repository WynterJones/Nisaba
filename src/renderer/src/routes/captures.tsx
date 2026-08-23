import { useNavigate } from 'react-router'
import { Camera, ExternalLink, FolderOpen, Trash2 } from 'lucide-react'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
import { cn } from '@/lib/utils'
import { useApp, useLibrary } from '@/store'
import { Button } from '@/components/ui/button'
import type { CaptureRecord } from '../../../preload'

const KIND_LABEL: Record<CaptureRecord['kind'], string> = {
  viewport: 'Viewport',
  fullpage: 'Full page',
  region: 'Region',
  element: 'Element'
}

function RowActions({
  record,
  floating
}: {
  record: CaptureRecord
  floating?: boolean
}): React.JSX.Element {
  const remove = useLibrary((s) => s.remove)
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
        floating &&
          'absolute right-2 top-2 rounded-lg border border-border bg-background/90 p-0.5 backdrop-blur'
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        title="Reveal in Finder"
        onClick={() => window.api.library.reveal(record.file)}
      >
        <FolderOpen className="size-3.5" />
      </Button>
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
        title="Delete capture"
        className="hover:text-destructive"
        onClick={() => void remove('captures', record.id)}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

export default function Captures(): React.JSX.Element {
  const captures = useLibrary((s) => s.captures)
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()

  const revisit = (url: string): void => {
    newTab(url)
    void navigate('/browse')
  }

  return (
    <LibraryFrame
      icon={Camera}
      title="Captures"
      items={captures}
      search={(c) => `${c.title} ${c.url} ${c.kind}`}
      emptyTitle="No captures yet"
      emptyBlurb="Open a page in Browse and use the Capture menu — viewport, full page or a dragged region. Everything you take shows up here with its source."
    >
      {(shown, view) =>
        view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4 p-5">
            {shown.map((record) => (
              <figure
                key={record.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-brand/50"
              >
                <RowActions record={record} floating />
                <button
                  onClick={() => revisit(record.url)}
                  title="Reopen the source page"
                  className="block aspect-[4/3] overflow-hidden bg-secondary/40"
                >
                  <img
                    src={window.api.library.url(record.file)}
                    alt={record.title}
                    loading="lazy"
                    className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </button>
                <figcaption className="border-t border-border px-3 py-2">
                  <p className="truncate text-sm font-medium">{record.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {record.host} · {KIND_LABEL[record.kind]} · {record.width}×{record.height} ·{' '}
                    {timeAgo(record.createdAt)}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((record) => (
              <li
                key={record.id}
                className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-accent/40"
              >
                <img
                  src={window.api.library.url(record.file)}
                  alt=""
                  loading="lazy"
                  className="h-10 w-16 shrink-0 rounded border border-border object-cover object-top"
                />
                <button onClick={() => revisit(record.url)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{record.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{record.url}</span>
                </button>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {KIND_LABEL[record.kind]}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                  {timeAgo(record.createdAt)}
                </span>
                <RowActions record={record} />
              </li>
            ))}
          </ul>
        )
      }
    </LibraryFrame>
  )
}

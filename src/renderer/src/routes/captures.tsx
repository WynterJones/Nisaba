import { useNavigate } from 'react-router'
import { useState } from 'react'
import { Camera, ExternalLink, FolderOpen, PenLine, Trash2 } from 'lucide-react'
import { Annotator } from '@/components/library/annotator'
import { CaptureViewer } from '@/components/library/capture-viewer'
import { TagEditor } from '@/components/library/tag-editor'
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
  floating,
  onAnnotate
}: {
  record: CaptureRecord
  floating?: boolean
  onAnnotate: (record: CaptureRecord) => void
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
        title="Annotate"
        onClick={() => onAnnotate(record)}
      >
        <PenLine className="size-3.5" />
      </Button>
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
  const setOverlay = useApp((s) => s.setOverlay)
  const navigate = useNavigate()
  const [annotating, setAnnotating] = useState<CaptureRecord | null>(null)
  const [viewing, setViewing] = useState<CaptureRecord | null>(null)

  const openViewer = (record: CaptureRecord): void => {
    setOverlay(true)
    setViewing(record)
  }
  const closeViewer = (): void => {
    setOverlay(false)
    setViewing(null)
  }

  const openAnnotator = (record: CaptureRecord): void => {
    setOverlay(true)
    setAnnotating(record)
  }
  const closeAnnotator = (): void => {
    setOverlay(false)
    setAnnotating(null)
  }

  /** `revisit` still backs the row action that jumps straight to the source page. */

  const revisit = (url: string): void => {
    newTab(url)
    void navigate('/browse')
  }

  return (
    <>
      {annotating && (
        <Annotator
          capture={captures.find((c) => c.id === annotating.id) ?? annotating}
          onClose={closeAnnotator}
        />
      )}
      {viewing && !annotating && (
        <CaptureViewer
          capture={captures.find((c) => c.id === viewing.id) ?? viewing}
          siblings={captures}
          onSelect={setViewing}
          onClose={closeViewer}
          onAnnotate={(record) => {
            setViewing(null)
            setAnnotating(record)
          }}
        />
      )}
    <LibraryFrame
      icon={Camera}
      title="Captures"
      items={captures}
      search={(c) => `${c.title} ${c.url} ${c.kind}`}
      emptyTitle="No captures yet"
      emptyBlurb="Open a page in Browse and use the Capture menu — viewport, full page or a dragged region. Everything you take shows up here with its source."
      views={['grid', 'table']}
      groupBy={{ label: 'Site', of: (c) => c.host }}
      nameOf={(c) => c.title}
      tagsOf={(c) => c.tags ?? []}
    >
      {(shown, view) =>
        view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4 p-5">
            {shown.map((record) => (
              <figure
                key={record.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-brand/50"
              >
                <RowActions record={record} floating onAnnotate={openAnnotator} />
                <button
                  onClick={() => openViewer(record)}
                  title="Open this capture"
                  className="block aspect-[4/3] overflow-hidden bg-secondary/40"
                >
                  <img
                    src={window.api.library.url(record.file, true)}
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
                    {record.annotations?.length ? ` · ${record.annotations.length} note(s)` : ''}
                  </p>
                  <TagEditor
                    collection="captures"
                    id={record.id}
                    tags={record.tags ?? []}
                    className="mt-1.5"
                  />
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
                  src={window.api.library.url(record.file, true)}
                  alt=""
                  loading="lazy"
                  className="h-10 w-16 shrink-0 rounded border border-border object-cover object-top"
                />
                <button onClick={() => openViewer(record)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{record.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{record.url}</span>
                </button>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {KIND_LABEL[record.kind]}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                  {timeAgo(record.createdAt)}
                </span>
                <RowActions record={record} onAnnotate={openAnnotator} />
              </li>
            ))}
          </ul>
        )
      }
    </LibraryFrame>
    </>
  )
}

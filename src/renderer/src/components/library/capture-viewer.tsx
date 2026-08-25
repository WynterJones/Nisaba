import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  Globe,
  Maximize2,
  Minimize2,
  PenLine,
  Sparkles,
  Trash2
} from 'lucide-react'
import { timeAgo } from '@/components/library/frame'
import { TagEditor } from '@/components/library/tag-editor'
import { useApp, useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CaptureRecord } from '../../../../preload'
import { openInApp } from '@/actions'

const KIND_LABEL: Record<CaptureRecord['kind'], string> = {
  viewport: 'Viewport',
  fullpage: 'Full page',
  region: 'Region',
  element: 'Element'
}

/**
 * Opens the image, not the website — the capture is the artifact. Everything you might
 * want to do with it hangs off here, including getting back to where it came from.
 */
export function CaptureViewer({
  capture,
  siblings,
  onSelect,
  onClose,
  onAnnotate
}: {
  capture: CaptureRecord
  siblings: CaptureRecord[]
  onSelect: (record: CaptureRecord) => void
  onClose: () => void
  onAnnotate: (record: CaptureRecord) => void
}): React.JSX.Element {
  const [actual, setActual] = useState(false)
  const [similar, setSimilar] = useState<
    { id: string; collection: string; score: number; record: Record<string, unknown> }[] | null
  >(null)
  const [searching, setSearching] = useState(false)
  const remove = useLibrary((s) => s.remove)
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()

  const index = siblings.findIndex((c) => c.id === capture.id)
  const step = (by: number): void => {
    const next = siblings[index + by]
    if (next) onSelect(next)
  }

  useEffect(() => {
    setSimilar(null)
  }, [capture.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, siblings])

  const revisit = (): void => {
    newTab(capture.url)
    onClose()
    void navigate('/browse')
  }

  const drop = async (): Promise<void> => {
    const next = siblings[index + 1] ?? siblings[index - 1] ?? null
    await remove('captures', capture.id)
    if (next) onSelect(next)
    else onClose()
  }

  const findSimilar = async (): Promise<void> => {
    setSearching(true)
    try {
      await window.api.similar.index()
      setSimilar(await window.api.similar.find({ collection: 'captures', id: capture.id }))
    } finally {
      setSearching(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(1200px,94vw)]">
        <DialogHeader>
          <DialogTitle className="truncate">{capture.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px] font-normal">
              {KIND_LABEL[capture.kind]}
            </Badge>
            <span className="tabular-nums">
              {capture.width} × {capture.height}
            </span>
            <span>·</span>
            <span>{capture.host}</span>
            <span>·</span>
            <span>{timeAgo(capture.createdAt)}</span>
            {capture.annotations?.length ? (
              <>
                <span>·</span>
                <span className="text-brand-bright">
                  {capture.annotations.length} annotation
                  {capture.annotations.length === 1 ? '' : 's'}
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <ScrollArea
            className={cn(
              'rounded-lg border border-border bg-[repeating-conic-gradient(#141418_0%_25%,#0f0f12_0%_50%)] bg-[length:20px_20px]',
              actual ? 'h-[62vh]' : 'h-[62vh]'
            )}
          >
            <img
              src={window.api.library.url(capture.file)}
              alt={capture.title}
              className={cn('mx-auto', actual ? 'max-w-none' : 'w-full')}
            />
          </ScrollArea>

          {siblings.length > 1 && (
            <>
              <button
                onClick={() => step(-1)}
                disabled={index <= 0}
                aria-label="Previous capture"
                className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/85 text-muted-foreground backdrop-blur transition-colors hover:text-foreground disabled:opacity-0"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => step(1)}
                disabled={index >= siblings.length - 1}
                aria-label="Next capture"
                className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/85 text-muted-foreground backdrop-blur transition-colors hover:text-foreground disabled:opacity-0"
              >
                <ChevronRight className="size-4" />
              </button>
            </>
          )}
        </div>

        {similar !== null && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {similar.length > 0
                ? `${similar.length} visually similar`
                : 'Nothing else in the library looks like this'}
            </span>
            <div className="flex flex-wrap gap-2">
              {similar.map((hit) => {
                const record = hit.record as { file?: string; host?: string }
                const match = siblings.find((c) => c.id === hit.id)
                return (
                  <button
                    key={`${hit.collection}-${hit.id}`}
                    onClick={() => match && onSelect(match)}
                    title={`${record.host ?? hit.collection} · ${Math.round(hit.score * 100)}% alike`}
                    className="group relative overflow-hidden rounded border border-border transition-colors hover:border-brand/60"
                  >
                    {record.file && (
                      <img
                        src={window.api.library.url(record.file, true)}
                        alt=""
                        className="h-14 w-20 object-cover object-top"
                      />
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-background/80 text-[9px] tabular-nums text-brand-bright">
                      {Math.round(hit.score * 100)}%
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <TagEditor collection="captures" id={capture.id} tags={capture.tags ?? []} />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {index + 1} of {siblings.length}
          </span>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActual((v) => !v)}
            title={actual ? 'Fit to width' : 'Actual size'}
          >
            {actual ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            {actual ? 'Fit' : 'Actual size'}
          </Button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void findSimilar()} disabled={searching}>
              <Sparkles className="size-3.5" />
              Find similar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onAnnotate(capture)}>
              <PenLine className="size-3.5" />
              Annotate
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.api.library.reveal(capture.file)}
            >
              <FolderOpen className="size-3.5" />
              Reveal
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openInApp(capture.url)}
              title={capture.url}
            >
              <ExternalLink className="size-3.5" />
              Default browser
            </Button>
            <Button size="sm" onClick={revisit}>
              <Globe className="size-3.5" />
              Open original page
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete capture"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => void drop()}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

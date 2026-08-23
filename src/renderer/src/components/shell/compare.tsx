import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  Camera,
  Columns2,
  Loader2,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  SquareSplitHorizontal
} from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo } from '@/components/library/frame'
import { useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CaptureRecord } from '../../../../preload'

type Mode = 'side' | 'wipe' | 'difference'

const MODES: { id: Mode; icon: typeof Columns2; label: string; hint: string }[] = [
  { id: 'side', icon: Columns2, label: 'Side by side', hint: 'Both at once' },
  { id: 'wipe', icon: SlidersHorizontal, label: 'Wipe', hint: 'Drag the divider' },
  { id: 'difference', icon: SquareSplitHorizontal, label: 'Difference', hint: 'What moved' }
]

/** Compact A/B slot: shows what is selected and opens a grid to change it. */
function Slot({
  badge,
  record,
  captures,
  onChange
}: {
  badge: string
  record: CaptureRecord | null
  captures: CaptureRecord[]
  onChange: (record: CaptureRecord) => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border bg-secondary/40 p-2 text-left transition-colors hover:border-brand/50">
          <span className="grid size-6 shrink-0 place-items-center rounded bg-brand text-[11px] font-bold text-primary-foreground">
            {badge}
          </span>
          {record ? (
            <>
              <img
                src={window.api.library.url(record.file)}
                alt=""
                className="h-9 w-12 shrink-0 rounded border border-border object-cover object-top"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{record.title}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {record.host} · {record.width}×{record.height} · {timeAgo(record.createdAt)}
                </span>
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Choose a capture…</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[26rem] p-2">
        <div className="grid max-h-72 grid-cols-3 gap-2 overflow-auto">
          {captures.map((option) => (
            <button
              key={option.id}
              onClick={() => onChange(option)}
              title={`${option.title} · ${option.host}`}
              className={cn(
                'overflow-hidden rounded border-2 transition-colors',
                record?.id === option.id ? 'border-brand' : 'border-transparent hover:border-border'
              )}
            >
              <img
                src={window.api.library.url(option.file)}
                alt=""
                loading="lazy"
                className="h-16 w-full object-cover object-top"
              />
              <span className="block truncate px-1 py-0.5 text-[9px] text-muted-foreground">
                {option.host}
              </span>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Compare({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { captures, refresh } = useLibrary()
  const [mode, setMode] = useState<Mode>('side')
  const [fill, setFill] = useState(false)
  const [wipe, setWipe] = useState(50)
  const [left, setLeft] = useState<CaptureRecord | null>(captures[1] ?? null)
  const [right, setRight] = useState<CaptureRecord | null>(captures[0] ?? null)
  const [busy, setBusy] = useState(false)
  const [diff, setDiff] = useState<number | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const wipeBox = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const frame = useRef(0)
  const [canvasWidth, setCanvasWidth] = useState(0)

  const ready = Boolean(left && right)
  /** Only worth flagging when the shots were taken at different widths. */
  const mismatch = useMemo(
    () => (left && right ? left.width !== right.width : false),
    [left?.id, right?.id]
  )

  /**
   * Page captures are far taller than they are wide, so "fit" means fit the width and scroll
   * down — letterboxing an 18,000px page into a panel would render it as a useless sliver.
   */
  const imageClass = fill ? 'block max-w-none' : 'block w-full'

  /** Fill the pane, but never blow a capture up past the pixels it actually has. */
  const fitTo = (naturalWidth: number): React.CSSProperties =>
    fill ? {} : { maxWidth: naturalWidth || undefined }

  const recapture = async (): Promise<void> => {
    setBusy(true)
    try {
      const record = await window.api.capture.viewport()
      if (record) {
        await refresh()
        setRight(record)
        toast.success('Captured', { description: record.host })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (mode !== 'difference' || !left || !right || !canvas.current) return
    let cancelled = false

    void (async () => {
      const load = (file: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = reject
          image.src = window.api.library.url(file)
        })

      const [a, b] = await Promise.all([load(left.file), load(right.file)])
      if (cancelled || !canvas.current) return

      // Match on width and keep each image's own aspect, then compare the overlapping
      // height. Squashing both into one box would report the distortion as difference.
      const w = Math.min(a.naturalWidth, b.naturalWidth, 1400)
      const heightAt = (image: HTMLImageElement): number =>
        Math.round(image.naturalHeight * (w / image.naturalWidth))
      const h = Math.min(heightAt(a), heightAt(b), 4000)

      canvas.current.width = w
      canvas.current.height = h
      const ctx = canvas.current.getContext('2d', { willReadFrequently: true })!

      ctx.drawImage(a, 0, 0, w, heightAt(a))
      const first = ctx.getImageData(0, 0, w, h)
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(b, 0, 0, w, heightAt(b))
      const second = ctx.getImageData(0, 0, w, h)

      const out = ctx.createImageData(w, h)
      let changed = 0
      for (let i = 0; i < first.data.length; i += 4) {
        const delta =
          Math.abs(first.data[i] - second.data[i]) +
          Math.abs(first.data[i + 1] - second.data[i + 1]) +
          Math.abs(first.data[i + 2] - second.data[i + 2])
        if (delta > 30) {
          changed++
          out.data[i] = 160
          out.data[i + 1] = 107
          out.data[i + 2] = 240
          out.data[i + 3] = 255
        } else {
          const grey = (first.data[i] + first.data[i + 1] + first.data[i + 2]) / 3
          out.data[i] = out.data[i + 1] = out.data[i + 2] = grey * 0.18
          out.data[i + 3] = 255
        }
      }
      ctx.putImageData(out, 0, 0)
      setCanvasWidth(w)
      setDiff((changed / (w * h)) * 100)
    })()

    return () => {
      cancelled = true
    }
  }, [mode, left?.id, right?.id])

  /**
   * Pointer capture keeps the drag alive outside the surface, and updates are coalesced to
   * one per frame so the divider tracks the cursor instead of stuttering behind it.
   */
  const moveWipe = (clientX: number): void => {
    if (!wipeBox.current) return
    const rect = wipeBox.current.getBoundingClientRect()
    const next = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => setWipe(next))
  }

  const onWipeDown = (e: React.PointerEvent): void => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    moveWipe(e.clientX)
  }

  const onWipeMove = (e: React.PointerEvent): void => {
    if (dragging.current) moveWipe(e.clientX)
  }

  const endWipe = (e: React.PointerEvent): void => {
    dragging.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const surface = 'relative h-[54vh] rounded-lg border border-border bg-[#0b0b0d]'

  const body = (): React.JSX.Element => {
    if (!ready) {
      return (
        <div className={cn(surface, 'grid place-items-center text-sm text-muted-foreground')}>
          Pick a capture for A and B.
        </div>
      )
    }

    if (mode === 'side') {
      return (
        <div className="grid h-[54vh] grid-cols-2 gap-2">
          {[
            ['A', left!],
            ['B', right!]
          ].map(([badge, record]) => (
            <div
              key={badge as string}
              className="relative overflow-hidden rounded-lg border border-border bg-[#0b0b0d]"
            >
              <span className="absolute left-2 top-2 z-10 grid size-5 place-items-center rounded bg-brand text-[10px] font-bold text-primary-foreground">
                {badge as string}
              </span>
              <ScrollArea className="h-full">
                <img
                  src={window.api.library.url((record as CaptureRecord).file)}
                  alt=""
                  className={imageClass}
                  style={fitTo((record as CaptureRecord).width)}
                />
              </ScrollArea>
            </div>
          ))}
        </div>
      )
    }

    if (mode === 'wipe') {
      return (
        <div
          ref={wipeBox}
          onPointerDown={onWipeDown}
          onPointerMove={onWipeMove}
          onPointerUp={endWipe}
          onPointerCancel={endWipe}
          className={cn(surface, 'cursor-ew-resize select-none overflow-hidden')}
        >
          <ScrollArea className="h-full">
            {/* Both live in one scroller, so they stay aligned as you scroll down. */}
            <div className="relative">
              <img
                src={window.api.library.url(left!.file)}
                alt=""
                className={imageClass}
                style={fitTo(left!.width)}
                draggable={false}
              />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${wipe}%)` }}>
                <img
                  src={window.api.library.url(right!.file)}
                  alt=""
                  className={imageClass}
                  style={fitTo(right!.width)}
                  draggable={false}
                />
              </div>
            </div>
          </ScrollArea>

          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-brand-bright shadow-[0_0_12px_var(--brand-bright)]"
            style={{ left: `${wipe}%` }}
          >
            <span className="absolute top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-brand-bright bg-background">
              <ArrowLeftRight className="size-3.5 text-brand-bright" />
            </span>
          </div>

          <span className="absolute left-2 top-2 grid size-5 place-items-center rounded bg-brand text-[10px] font-bold text-primary-foreground">
            A
          </span>
          <span className="absolute right-2 top-2 grid size-5 place-items-center rounded bg-brand text-[10px] font-bold text-primary-foreground">
            B
          </span>
        </div>
      )
    }

    return (
      <div className={cn(surface, 'overflow-hidden')}>
        <ScrollArea className="h-full">
          <canvas ref={canvas} className={imageClass} style={fitTo(canvasWidth)} />
        </ScrollArea>
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(1100px,94vw)]">
        <DialogHeader>
          <DialogTitle>Compare</DialogTitle>
          <DialogDescription>
            Put two captures against each other — a reference and a later shot, or a source and
            what you built.
          </DialogDescription>
        </DialogHeader>

        {captures.length < 2 ? (
          <div className="grid h-40 place-items-center rounded-lg border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
            Compare needs at least two captures. Take a couple in Browse first.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Slot badge="A" record={left} captures={captures} onChange={setLeft} />
              <Button
                variant="ghost"
                size="icon-sm"
                title="Swap A and B"
                onClick={() => {
                  setLeft(right)
                  setRight(left)
                }}
              >
                <ArrowLeftRight className="size-3.5" />
              </Button>
              <Slot badge="B" record={right} captures={captures} onChange={setRight} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
                {MODES.map(({ id, icon: Icon, label, hint }) => (
                  <button
                    key={id}
                    onClick={() => setMode(id)}
                    title={hint}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors',
                      mode === id
                        ? 'bg-brand/15 text-brand-bright ring-1 ring-inset ring-brand/50'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFill((v) => !v)}
                title={fill ? 'Fit to the panel width' : 'Show at full size'}
              >
                {fill ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                {fill ? 'Fit width' : 'Full size'}
              </Button>

              <Button variant="ghost" size="sm" onClick={() => void recapture()} disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                Capture into B
              </Button>

              <div className="ml-auto flex items-center gap-3 text-xs">
                {mode === 'difference' && diff !== null && (
                  <span className="text-muted-foreground">
                    <span className="text-brand-bright">{diff.toFixed(1)}%</span> of pixels differ
                  </span>
                )}
                {mismatch && (
                  <span className="text-amber-300/80">
                    Captured at different widths — scaled to match
                  </span>
                )}
              </div>
            </div>

            {body()}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

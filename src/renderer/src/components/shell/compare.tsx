import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Columns2, Layers, Loader2, SquareSplitHorizontal } from 'lucide-react'
import { toast } from 'sonner'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CaptureRecord } from '../../../../preload'

type Mode = 'side' | 'overlay' | 'difference'

const MODES: { id: Mode; icon: typeof Columns2; label: string }[] = [
  { id: 'side', icon: Columns2, label: 'Side by side' },
  { id: 'overlay', icon: Layers, label: 'Overlay' },
  { id: 'difference', icon: SquareSplitHorizontal, label: 'Difference' }
]

function Picker({
  label,
  captures,
  value,
  onChange,
  onRecapture,
  busy
}: {
  label: string
  captures: CaptureRecord[]
  value: CaptureRecord | null
  onChange: (record: CaptureRecord) => void
  onRecapture?: () => void
  busy?: boolean
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
        {onRecapture && (
          <Button variant="ghost" size="xs" onClick={onRecapture} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Camera />}
            Capture now
          </Button>
        )}
      </div>
      <ScrollArea className="h-20 rounded-lg border border-border">
        <div className="flex gap-1.5 p-1.5">
          {captures.map((record) => (
            <button
              key={record.id}
              onClick={() => onChange(record)}
              title={`${record.title} · ${record.kind}`}
              className={cn(
                'h-14 w-20 shrink-0 overflow-hidden rounded border-2 transition-colors',
                value?.id === record.id ? 'border-brand' : 'border-transparent hover:border-border'
              )}
            >
              <img
                src={window.api.library.url(record.file)}
                alt=""
                loading="lazy"
                className="size-full object-cover object-top"
              />
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * Compares two captures — a source reference against a later recapture, or against
 * generated output once you screenshot it. Difference is computed in a canvas locally.
 */
export function Compare({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { captures, refresh } = useLibrary()
  const [mode, setMode] = useState<Mode>('side')
  const [opacity, setOpacity] = useState(50)
  const [left, setLeft] = useState<CaptureRecord | null>(captures[1] ?? captures[0] ?? null)
  const [right, setRight] = useState<CaptureRecord | null>(captures[0] ?? null)
  const [busy, setBusy] = useState(false)
  const [diffStat, setDiffStat] = useState<number | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  const sameSite = useMemo(
    () => (left && right ? left.host === right.host : true),
    [left?.host, right?.host]
  )

  const recapture = async (): Promise<void> => {
    setBusy(true)
    try {
      const record = await window.api.capture.viewport()
      if (record) {
        await refresh()
        setRight(record)
        toast.success('Recaptured', { description: record.host })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
    } finally {
      setBusy(false)
    }
  }

  /** Pixel difference, drawn at a shared size so mismatched captures still line up. */
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

      const w = Math.min(a.naturalWidth, b.naturalWidth, 1400)
      const h = Math.min(a.naturalHeight, b.naturalHeight, 3000)
      canvas.current.width = w
      canvas.current.height = h
      const ctx = canvas.current.getContext('2d', { willReadFrequently: true })!

      ctx.drawImage(a, 0, 0, w, h)
      const first = ctx.getImageData(0, 0, w, h)
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(b, 0, 0, w, h)
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
          // Brand purple marks a real change; everything identical fades to near-black.
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
      setDiffStat((changed / (w * h)) * 100)
    })()

    return () => {
      cancelled = true
    }
  }, [mode, left?.id, right?.id])

  const body = (): React.JSX.Element => {
    if (!left || !right) {
      return (
        <div className="grid h-[46vh] place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          Pick two captures to compare.
        </div>
      )
    }

    if (mode === 'side') {
      return (
        <div className="grid h-[46vh] grid-cols-2 gap-2">
          {[left, right].map((record, i) => (
            <ScrollArea key={`${record.id}-${i}`} className="rounded-lg border border-border">
              <img src={window.api.library.url(record.file)} alt="" className="w-full" />
            </ScrollArea>
          ))}
        </div>
      )
    }

    if (mode === 'overlay') {
      return (
        <ScrollArea className="h-[46vh] rounded-lg border border-border">
          <div className="relative">
            <img src={window.api.library.url(left.file)} alt="" className="w-full" />
            <img
              src={window.api.library.url(right.file)}
              alt=""
              style={{ opacity: opacity / 100 }}
              className="absolute inset-0 size-full object-cover object-top"
            />
          </div>
        </ScrollArea>
      )
    }

    return (
      <ScrollArea className="h-[46vh] rounded-lg border border-border bg-[#08080a]">
        <canvas ref={canvas} className="w-full" />
      </ScrollArea>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(1100px,94vw)]">
        <DialogHeader>
          <DialogTitle>Compare</DialogTitle>
          <DialogDescription>
            Put a source reference next to a later recapture — or next to a screenshot of what you
            built. Difference is computed locally, and pixel equality is never the goal.
          </DialogDescription>
        </DialogHeader>

        {captures.length < 2 ? (
          <div className="grid h-40 place-items-center rounded-lg border border-dashed border-border px-6 text-center text-sm text-muted-foreground">
            Compare needs at least two captures. Take a couple in Browse first.
          </div>
        ) : (
          <>
            <div className="flex gap-4">
              <Picker label="Reference" captures={captures} value={left} onChange={setLeft} />
              <Picker
                label="Compared with"
                captures={captures}
                value={right}
                onChange={setRight}
                onRecapture={recapture}
                busy={busy}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-0.5">
                {MODES.map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    onClick={() => setMode(id)}
                    title={label}
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

              {mode === 'overlay' && (
                <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                  Opacity
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="h-1 flex-1 accent-[var(--brand)]"
                  />
                  <span className="w-9 text-right tabular-nums">{opacity}%</span>
                </label>
              )}

              {mode === 'difference' && diffStat !== null && (
                <span className="text-xs text-muted-foreground">
                  <span className="text-brand-bright">{diffStat.toFixed(1)}%</span> of pixels differ
                </span>
              )}

              {!sameSite && (
                <span className="text-xs text-amber-300/80">
                  Different sites — sizes may not line up.
                </span>
              )}
            </div>

            {body()}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

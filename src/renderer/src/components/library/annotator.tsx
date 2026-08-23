import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Circle,
  Download,
  Droplet,
  Highlighter,
  Loader2,
  Minus,
  Square,
  Trash2,
  Type,
  Undo2
} from 'lucide-react'
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
import type { Annotation, CaptureRecord } from '../../../../preload'

type Tool = Annotation['type'] | 'callout'

const TOOLS: { id: Tool; icon: typeof Square; label: string }[] = [
  { id: 'rect', icon: Square, label: 'Rectangle' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'highlight', icon: Highlighter, label: 'Highlight' },
  { id: 'blur', icon: Droplet, label: 'Blur' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'callout', icon: Circle, label: 'Numbered callout' }
]

const COLORS = ['#a06bf0', '#f43f5e', '#22c55e', '#f59e0b', '#38bdf8', '#ffffff']

let seq = 0
const nextId = (): string => `a${Date.now()}-${++seq}`

/** Renders one annotation as SVG. Coordinates are 0..1 of the image, so it scales. */
function Shape({ shape, w, h }: { shape: Annotation; w: number; h: number }): React.JSX.Element {
  const stroke = shape.color
  if (shape.type === 'rect' || shape.type === 'highlight' || shape.type === 'blur') {
    const { x, y, width, height } = shape.rect
    return (
      <rect
        x={x * w}
        y={y * h}
        width={width * w}
        height={height * h}
        rx={shape.type === 'blur' ? 4 : 2}
        fill={
          shape.type === 'highlight'
            ? `${stroke}44`
            : shape.type === 'blur'
              ? 'rgba(20,20,24,0.92)'
              : 'none'
        }
        stroke={shape.type === 'blur' ? 'none' : stroke}
        strokeWidth={3}
      />
    )
  }
  if (shape.type === 'ellipse') {
    const { x, y, width, height } = shape.rect
    return (
      <ellipse
        cx={(x + width / 2) * w}
        cy={(y + height / 2) * h}
        rx={(width / 2) * w}
        ry={(height / 2) * h}
        fill="none"
        stroke={stroke}
        strokeWidth={3}
      />
    )
  }
  if (shape.type === 'arrow' || shape.type === 'line') {
    return (
      <line
        x1={shape.from.x * w}
        y1={shape.from.y * h}
        x2={shape.to.x * w}
        y2={shape.to.y * h}
        stroke={stroke}
        strokeWidth={3}
        strokeLinecap="round"
        markerEnd={shape.type === 'arrow' ? 'url(#nisaba-arrow)' : undefined}
      />
    )
  }
  if (shape.type === 'text') {
    if (!shape.text) return <g />
    return (
      <text
        x={shape.at.x * w}
        y={shape.at.y * h}
        fill={stroke}
        fontSize={18}
        fontWeight={600}
        fontFamily="Inter, system-ui, sans-serif"
        paintOrder="stroke"
        stroke="rgba(0,0,0,0.75)"
        strokeWidth={4}
      >
        {shape.text}
      </text>
    )
  }
  if (shape.type !== 'callout') return <g />
  return (
    <g>
      <circle cx={shape.at.x * w} cy={shape.at.y * h} r={13} fill={stroke} />
      <text
        x={shape.at.x * w}
        y={shape.at.y * h + 5}
        textAnchor="middle"
        fill="#0a0a0b"
        fontSize={14}
        fontWeight={700}
        fontFamily="Inter, system-ui, sans-serif"
      >
        {shape.index}
      </text>
    </g>
  )
}

export function Annotator({
  capture,
  onClose
}: {
  capture: CaptureRecord
  onClose: () => void
}): React.JSX.Element {
  const [shapes, setShapes] = useState<Annotation[]>(capture.annotations ?? [])
  const [tool, setTool] = useState<Tool>('rect')
  const [color, setColor] = useState(COLORS[0])
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [ghost, setGhost] = useState<Annotation | null>(null)
  const [editing, setEditing] = useState<{ id: string; x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  /**
   * The SVG draws in the surface's pixel space, so it has to know that size. A ResizeObserver
   * alone was not enough — the surface has no height until the image decodes, so the image's
   * own load event is the reliable trigger and the observer just keeps it honest afterwards.
   */
  const measure = useCallback((): void => {
    const el = boxRef.current
    if (!el) return
    const w = el.clientWidth
    const h = el.clientHeight || el.scrollHeight
    if (w > 0 && h > 0) setSize((current) => (current.w === w && current.h === h ? current : { w, h }))
  }, [])

  useLayoutEffect(() => {
    measure()
    const el = boxRef.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  const update = (id: string, patch: Partial<Annotation>): void =>
    setShapes((current) =>
      current.map((shape) => (shape.id === id ? ({ ...shape, ...patch } as Annotation) : shape))
    )

  /** Everything is stored normalised, so a re-export at any size stays correct. */
  const at = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = boxRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  }

  const build = (from: { x: number; y: number }, to: { x: number; y: number }): Annotation => {
    const base = { id: nextId(), color }
    if (tool === 'arrow' || tool === 'line') return { ...base, type: tool, from, to }
    if (tool === 'text') return { ...base, type: 'text', at: to, text: 'Note' }
    if (tool === 'callout') {
      const index = shapes.filter((s) => s.type === 'callout').length + 1
      return { ...base, type: 'callout', at: to, index }
    }
    return {
      ...base,
      type: tool as 'rect' | 'ellipse' | 'highlight' | 'blur',
      rect: {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        width: Math.abs(to.x - from.x),
        height: Math.abs(to.y - from.y)
      }
    }
  }

  const onDown = (e: React.MouseEvent): void => {
    const point = at(e)
    if (tool === 'text' || tool === 'callout') {
      const shape = build(point, point)
      if (shape.type === 'text') {
        // Electron has no window.prompt, so the label is typed straight onto the image.
        shape.text = ''
        setShapes((s) => [...s, shape])
        setEditing({ id: shape.id, x: point.x, y: point.y })
        return
      }
      setShapes((s) => [...s, shape])
      return
    }
    setDrag(point)
  }

  /** Commits or discards the label being typed. */
  const finishText = (keep: boolean): void => {
    if (!editing) return
    const current = shapes.find((s) => s.id === editing.id)
    if (!keep || (current?.type === 'text' && !current.text.trim())) {
      setShapes((s) => s.filter((shape) => shape.id !== editing.id))
    }
    setEditing(null)
  }

  const onMove = (e: React.MouseEvent): void => {
    if (!drag) return
    setGhost(build(drag, at(e)))
  }

  const onUp = (e: React.MouseEvent): void => {
    if (!drag) return
    const shape = build(drag, at(e))
    // The threshold has to be in pixels: a fraction of a 6000px-tall capture is enormous,
    // and every small box was being thrown away.
    const big =
      'rect' in shape
        ? shape.rect.width * size.w > 4 && shape.rect.height * size.h > 4
        : true
    if (big) setShapes((s) => [...s, shape])
    setDrag(null)
    setGhost(null)
  }

  const save = async (): Promise<void> => {
    await window.api.library.patch('captures', capture.id, { annotations: shapes })
    await useLibrary.getState().refresh()
    toast.success('Annotations saved', { description: 'The original screenshot is untouched.' })
    onClose()
  }

  /** Flattens the original plus the overlay into a new PNG the user chooses a home for. */
  const exportPng = async (): Promise<void> => {
    setSaving(true)
    try {
      const image = new Image()
      image.src = window.api.library.url(capture.file)
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
      })

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)

      const svg = document.getElementById('nisaba-annotation-layer') as unknown as SVGSVGElement
      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.setAttribute('width', String(canvas.width))
      clone.setAttribute('height', String(canvas.height))
      clone.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`)
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
        type: 'image/svg+xml'
      })
      const url = URL.createObjectURL(blob)
      const overlay = new Image()
      overlay.src = url
      await new Promise((resolve, reject) => {
        overlay.onload = resolve
        overlay.onerror = reject
      })
      ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)

      const saved = await window.api.library.saveImage(
        canvas.toDataURL('image/png'),
        `${capture.host}-annotated.png`
      )
      if (saved) toast.success('Exported', { description: saved })
    } catch {
      toast.error('Could not flatten the annotations')
    } finally {
      setSaving(false)
    }
  }

  const visible = ghost ? [...shapes, ghost] : shapes

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(1100px,92vw)]">
        <DialogHeader>
          <DialogTitle>Annotate</DialogTitle>
          <DialogDescription>
            Shapes are stored as editable vectors next to the capture — the original PNG is never
            modified.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 p-1.5">
          {TOOLS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTool(id)}
              title={label}
              className={cn(
                'grid size-8 place-items-center rounded-md transition-colors',
                tool === id
                  ? 'bg-brand/20 text-brand-bright ring-1 ring-inset ring-brand/50'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}

          <span className="mx-1 h-6 w-px bg-border" />

          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              style={{ background: c }}
              className={cn(
                'size-6 rounded-full border transition-transform',
                color === c ? 'scale-110 border-white' : 'border-white/20'
              )}
            />
          ))}

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={shapes.length === 0}
              onClick={() => setShapes((s) => s.slice(0, -1))}
            >
              <Undo2 className="size-3.5" />
              Undo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={shapes.length === 0}
              onClick={() => setShapes([])}
            >
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          </div>
        </div>

        {/* The scroll container is separate from the drawing surface, so a tall full-page
            capture can be scrolled and still annotated with correct coordinates. */}
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-secondary/30">
          <div
            ref={boxRef}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            className="relative cursor-crosshair select-none"
          >
          <img
            src={window.api.library.url(capture.file)}
            alt={capture.title}
            onLoad={measure}
            className="block w-full select-none"
            draggable={false}
          />
          <svg
            id="nisaba-annotation-layer"
            className="pointer-events-none absolute inset-0 size-full"
            viewBox={`0 0 ${size.w} ${size.h}`}
          >
            <defs>
              <marker
                id="nisaba-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
              </marker>
            </defs>
            {visible.map((shape) => (
              <Shape key={shape.id} shape={shape} w={size.w} h={size.h} />
            ))}
          </svg>

          {editing && (
            <input
              autoFocus
              value={
                (shapes.find((s) => s.id === editing.id) as { text?: string } | undefined)?.text ?? ''
              }
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => update(editing.id, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') finishText(true)
                if (e.key === 'Escape') finishText(false)
              }}
              onBlur={() => finishText(true)}
              placeholder="Label…"
              style={{
                left: editing.x * size.w,
                top: editing.y * size.h - 26,
                borderColor: color
              }}
              className="absolute z-10 w-52 rounded border-2 bg-background/95 px-2 py-1 text-sm outline-none"
            />
          )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {shapes.length} shape{shapes.length === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportPng} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Export PNG
            </Button>
            <Button onClick={save}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

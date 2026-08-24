import { useCanvas, type Frame } from '@/components/canvas/use-canvas'

const SPACING = 30
const RADIUS = 170
const DRIFT = 3
const TAU = Math.PI * 2

/**
 * A lattice of dots that leans toward the cursor and warms to brand purple near it,
 * with a slow ambient drift so the surface is alive even when nothing is moving.
 * Deliberately quiet — this sits behind content, not in front of it.
 */
function drawDots({ ctx, width, height, time, pointer }: Frame): void {
  const cols = Math.ceil(width / SPACING) + 1
  const rows = Math.ceil(height / SPACING) + 1
  const reach = RADIUS * RADIUS

  // The far dots are all the same colour and size, so they go into one path and one fill.
  // Drawing them individually meant ~1500 beginPath/arc/fill calls per frame, which is what
  // made this cost real CPU on a full-window canvas.
  ctx.fillStyle = 'rgba(190, 185, 205, 0.05)'
  ctx.beginPath()
  const near: { x: number; y: number; size: number; near: number }[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Two out-of-phase waves keep the drift from looking like a marching grid.
      const wave = Math.sin(time * 0.35 + col * 0.32) + Math.cos(time * 0.27 + row * 0.28)
      let x = col * SPACING + wave * DRIFT
      let y = row * SPACING + Math.sin(time * 0.31 + (col + row) * 0.22) * DRIFT

      const dx = pointer.x - x
      const dy = pointer.y - y
      const distance = dx * dx + dy * dy

      if (distance < reach) {
        const proximity = (1 - Math.sqrt(distance) / RADIUS) * pointer.strength
        const pull = proximity * proximity * 9
        const length = Math.sqrt(distance) || 1
        x += (dx / length) * pull
        y += (dy / length) * pull
        // Held back and drawn after the batch, because each one has its own colour.
        near.push({ x, y, size: 1 + proximity * 1.4, near: proximity })
        continue
      }

      ctx.moveTo(x + 1, y)
      ctx.arc(x, y, 1, 0, TAU)
    }
  }
  ctx.fill()

  for (const dot of near) {
    ctx.fillStyle = `rgba(${160 + dot.near * 20}, ${107 + dot.near * 40}, 240, ${0.05 + dot.near * 0.5})`
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, dot.size, 0, TAU)
    ctx.fill()
  }

  // A soft pool of light under the cursor, well below the dots in intensity.
  if (pointer.strength > 0.01) {
    const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, RADIUS * 1.6)
    glow.addColorStop(0, `rgba(121, 40, 219, ${0.13 * pointer.strength})`)
    glow.addColorStop(1, 'rgba(121, 40, 219, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, width, height)
  }
}

export function DotField({ className }: { className?: string }): React.JSX.Element {
  const ref = useCanvas(drawDots)
  return <canvas ref={ref} aria-hidden className={className} />
}

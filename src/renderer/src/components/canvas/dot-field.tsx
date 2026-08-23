import { useCanvas, type Frame } from '@/components/canvas/use-canvas'

const SPACING = 30
const RADIUS = 170
const DRIFT = 3

/**
 * A lattice of dots that leans toward the cursor and warms to brand purple near it,
 * with a slow ambient drift so the surface is alive even when nothing is moving.
 * Deliberately quiet — this sits behind content, not in front of it.
 */
function drawDots({ ctx, width, height, time, pointer }: Frame): void {
  const cols = Math.ceil(width / SPACING) + 1
  const rows = Math.ceil(height / SPACING) + 1
  const reach = RADIUS * RADIUS

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const baseX = col * SPACING
      const baseY = row * SPACING

      // Two out-of-phase waves keep the drift from looking like a marching grid.
      const wave = Math.sin(time * 0.35 + col * 0.32) + Math.cos(time * 0.27 + row * 0.28)
      let x = baseX + wave * DRIFT
      let y = baseY + Math.sin(time * 0.31 + (col + row) * 0.22) * DRIFT

      const dx = pointer.x - x
      const dy = pointer.y - y
      const distance = dx * dx + dy * dy

      let alpha = 0.05
      let size = 1

      if (distance < reach) {
        const near = (1 - Math.sqrt(distance) / RADIUS) * pointer.strength
        const pull = near * near * 9
        x += (dx / (Math.sqrt(distance) || 1)) * pull
        y += (dy / (Math.sqrt(distance) || 1)) * pull
        alpha = 0.05 + near * 0.5
        size = 1 + near * 1.4

        ctx.fillStyle = `rgba(${160 + near * 20}, ${107 + near * 40}, 240, ${alpha})`
      } else {
        ctx.fillStyle = `rgba(190, 185, 205, ${alpha})`
      }

      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }
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

import { useEffect, useRef, type RefObject } from 'react'

export type Pointer = {
  /** Eased position in CSS pixels, relative to the canvas. */
  x: number
  y: number
  /** How much the pointer is influencing things, 0..1. Fades in and out. */
  strength: number
}

export type Frame = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  /** Seconds since the first frame. */
  time: number
  pointer: Pointer
}

const EASE = 0.09
const STRENGTH_EASE = 0.06

/**
 * The boilerplate every canvas effect needs: device-pixel sizing, a paused-when-hidden
 * animation loop, an eased pointer, and reduced-motion handling. An effect just draws.
 */
export function useCanvas(
  draw: (frame: Frame) => void,
  { animate = true }: { animate?: boolean } = {}
): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let raf = 0
    let started = 0

    const target = { x: -1, y: -1, active: false }
    const pointer: Pointer = { x: 0, y: 0, strength: 0 }

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (pointer.x === 0 && pointer.y === 0) {
        pointer.x = width / 2
        pointer.y = height / 2
      }
      if (reduced || !animate) paint(0)
    }

    const paint = (time: number): void => {
      ctx.clearRect(0, 0, width, height)
      drawRef.current({ ctx, width, height, time, pointer })
    }

    const loop = (now: number): void => {
      if (!started) started = now
      // Chase the pointer rather than snapping to it; the lag is what reads as "soft".
      if (target.active) {
        pointer.x += (target.x - pointer.x) * EASE
        pointer.y += (target.y - pointer.y) * EASE
      }
      pointer.strength += ((target.active ? 1 : 0) - pointer.strength) * STRENGTH_EASE

      paint((now - started) / 1000)
      raf = requestAnimationFrame(loop)
    }

    const onMove = (e: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect()
      target.x = e.clientX - rect.left
      target.y = e.clientY - rect.top
      target.active =
        target.x >= 0 && target.y >= 0 && target.x <= rect.width && target.y <= rect.height
    }

    const onLeave = (): void => {
      target.active = false
    }

    const start = (): void => {
      if (!raf && !reduced && animate) raf = requestAnimationFrame(loop)
    }
    const stop = (): void => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const onVisibility = (): void => (document.hidden ? stop() : start())

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      observer.disconnect()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [animate])

  return ref
}

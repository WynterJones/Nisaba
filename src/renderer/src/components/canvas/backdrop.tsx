import { DotField } from '@/components/canvas/dot-field'
import { cn } from '@/lib/utils'

/**
 * The pointer-reactive dot field plus a vignette, behind anything that would otherwise be an
 * empty screen. Content goes in `children` and sits above it.
 */
export function Backdrop({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden',
        className
      )}
    >
      <DotField className="absolute inset-0 size-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--background)_5%,transparent_60%)]" />
      <div className="relative flex w-full flex-col items-center">{children}</div>
    </div>
  )
}

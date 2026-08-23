import art from '@/assets/backdrop.webp'
import { DotField } from '@/components/canvas/dot-field'
import { cn } from '@/lib/utils'

/**
 * The pointer-reactive dot field plus a vignette, behind anything that would otherwise be an
 * empty screen. Content goes in `children` and sits above it.
 */
export function Backdrop({
  children,
  className,
  scene = false
}: {
  children: React.ReactNode
  className?: string
  /** Shows the fox-vs-fox artwork behind the dots. Reserved for the dashboard. */
  scene?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden',
        className
      )}
    >
      {scene && (
        <>
          <div
            aria-hidden
            style={{ backgroundImage: `url(${art})` }}
            className="absolute inset-0 bg-cover bg-center"
          />
          {/* The artwork keeps its open middle; this just settles the edges into the app. */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_55%,var(--background)_100%)]" />
        </>
      )}

      <DotField className={cn('absolute inset-0 size-full', scene && 'opacity-60')} />

      <div
        className={cn(
          'pointer-events-none absolute inset-0',
          scene
            ? 'bg-[radial-gradient(ellipse_60%_50%_at_center,rgb(8_8_10/0.82)_0%,transparent_75%)]'
            : 'bg-[radial-gradient(ellipse_at_center,var(--background)_5%,transparent_60%)]'
        )}
      />

      <div className="relative flex w-full flex-col items-center">{children}</div>
    </div>
  )
}

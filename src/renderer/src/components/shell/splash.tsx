import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import logo from '@/assets/logo.png'
import wynter from '@/assets/wynter.png'
import { DotField } from '@/components/canvas/dot-field'
import { useApp } from '@/store'
import { cn } from '@/lib/utils'

const SHOW_MS = 2100
const FADE_MS = 420

/**
 * A short introduction on launch. It sits above everything, ignores pointer events once it
 * starts leaving, and unmounts itself — no state to reason about elsewhere.
 */
export function Splash(): React.JSX.Element | null {
  const [version, setVersion] = useState('')
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('in')
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()

  useEffect(() => {
    void window.api.getVersion().then(setVersion)
    const leave = setTimeout(() => setPhase('out'), SHOW_MS)
    const done = setTimeout(() => setPhase('gone'), SHOW_MS + FADE_MS)
    return () => {
      clearTimeout(leave)
      clearTimeout(done)
    }
  }, [])

  if (phase === 'gone') return null

  return (
    <div
      onClick={() => setPhase('out')}
      className={cn(
        'fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-background transition-opacity duration-[420ms]',
        phase === 'out' && 'pointer-events-none opacity-0'
      )}
    >
      <DotField className="absolute inset-0 size-full opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--background)_10%,transparent_65%)]" />

      <div className="relative flex flex-col items-center gap-6">
        <img
          src={logo}
          alt="Nisaba"
          draggable={false}
          className="h-24 select-none animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-700 ease-out"
        />

        <div className="flex flex-col items-center gap-1 animate-in fade-in duration-700 delay-200 fill-mode-backwards">
          <p className="text-sm tracking-wide text-muted-foreground">Browse. Capture. Compound.</p>
          <p className="font-mono text-xs text-brand-bright">v{version || '…'}</p>
        </div>
      </div>

      <div className="absolute bottom-10 flex flex-col items-center gap-2 animate-in fade-in duration-700 delay-500 fill-mode-backwards">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
          Made by
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            newTab('https://wynter.ai')
            setPhase('out')
            void navigate('/browse')
          }}
          className="transition-opacity hover:opacity-80"
          title="wynter.ai"
        >
          <img src={wynter} alt="Wynter.ai" draggable={false} className="h-8 select-none" />
        </button>
      </div>
    </div>
  )
}

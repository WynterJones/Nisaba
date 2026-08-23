import { useState } from 'react'
import { Blocks } from 'lucide-react'
import { saveElements } from '@/actions'
import { useApp } from '@/store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ElementCandidate } from '../../../../preload'

/**
 * Shows what the detector found so the user picks which instances are worth keeping.
 * Capture happens after the dialog closes, because the page has to be visible again.
 */
export function ElementPicker({
  candidates,
  onClose
}: {
  candidates: ElementCandidate[]
  onClose: () => void
}): React.JSX.Element {
  const setOverlay = useApp((s) => s.setOverlay)
  const [chosen, setChosen] = useState<Set<string>>(new Set(candidates.map((c) => c.key)))

  const toggle = (key: string): void =>
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const close = (): void => {
    setOverlay(false)
    onClose()
  }

  const save = (): void => {
    const picked = candidates.filter((c) => chosen.has(c.key))
    close()
    // The native view needs a frame to come back before we can screenshot through it.
    setTimeout(() => void saveElements(picked), 250)
  }

  const categories = [...new Set(candidates.map((c) => c.category))]

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(760px,92vw)]">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Blocks className="size-4 text-brand-bright" />
              {candidates.length} element{candidates.length === 1 ? '' : 's'} found
            </span>
          </DialogTitle>
          <DialogDescription>
            Visually identical instances are collapsed, so this is a list of variants rather than
            every button on the page. Each one you keep is screenshotted along with the interaction
            states the page actually declares rules for.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[48vh]">
          <div className="flex flex-col gap-4 pr-3">
            {categories.map((category) => (
              <section key={category} className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold text-muted-foreground">{category}</h3>
                {candidates
                  .filter((c) => c.category === category)
                  .map((candidate) => (
                    <label
                      key={candidate.key}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors',
                        chosen.has(candidate.key)
                          ? 'border-brand/50 bg-brand/5'
                          : 'border-border hover:bg-accent/40'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={chosen.has(candidate.key)}
                        onChange={() => toggle(candidate.key)}
                        className="size-4 accent-[var(--brand)]"
                      />

                      {/* A cheap likeness built from the element's own computed styles. */}
                      <span
                        className="grid h-7 min-w-16 shrink-0 place-items-center overflow-hidden px-2 text-[10px]"
                        style={{
                          background: candidate.styles['background-color'],
                          color: candidate.styles.color,
                          border: candidate.styles.border,
                          borderRadius: candidate.styles['border-radius'],
                          fontFamily: candidate.styles['font-family'],
                          fontWeight: Number(candidate.styles['font-weight']) || undefined
                        }}
                      >
                        {candidate.text.slice(0, 14) || candidate.category}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{candidate.label}</span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {candidate.selector}
                        </span>
                      </span>

                      <span className="flex shrink-0 gap-1">
                        {candidate.states.map((state) => (
                          <Badge
                            key={state}
                            variant="secondary"
                            className="font-mono text-[9px] font-normal"
                          >
                            :{state}
                          </Badge>
                        ))}
                      </span>
                    </label>
                  ))}
              </section>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="sm:justify-between">
          <span className="self-center text-xs text-muted-foreground">
            {chosen.size} selected
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={save} disabled={chosen.size === 0}>
              Save {chosen.size} to Elements
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

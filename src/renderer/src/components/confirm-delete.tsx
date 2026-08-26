import { useState } from 'react'
import { useApp } from '@/store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'

/**
 * The gate in front of anything that deletes. Records go straight off disk with no undo, so
 * every trash button routes through here instead of acting on a stray click. It wraps the
 * button the caller already had — the child becomes the trigger and keeps its own styling.
 */
export function ConfirmDelete({
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  children
}: {
  title: string
  /** What is about to be lost — a name or path, not a warning. */
  description?: React.ReactNode
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
  children: React.ReactElement
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  // The browsed page is a native view painted over the window; it has to step aside for a dialog.
  const setOverlay = useApp((s) => s.setOverlay)

  const close = (): void => {
    setOpen(false)
    setOverlay(false)
  }

  const confirm = async (): Promise<void> => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      close()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setOverlay(next)
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="break-words">
            {description ?? 'This cannot be undone.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

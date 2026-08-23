import { toast } from 'sonner'
import { useApp, useLibrary } from '@/store'

function fail(error: unknown): void {
  toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
}

async function capture(
  run: () => Promise<{ kind: string } | null>,
  cancelled: string
): Promise<void> {
  try {
    const record = await run()
    if (!record) return void toast.message(cancelled)
    await useLibrary.getState().refresh()
  } catch (error) {
    fail(error)
  }
}

export const captureViewport = (): Promise<void> =>
  capture(() => window.api.capture.viewport(), 'Capture cancelled')

export const captureFullPage = (): Promise<void> =>
  capture(() => window.api.capture.fullPage(), 'Capture cancelled')

export const captureRegion = (): Promise<void> =>
  capture(() => window.api.capture.region(), 'Region capture cancelled')

/**
 * Hands control to the page until the user picks an element or presses Escape.
 * The picked section lands in the inspector unsaved, so it can be reviewed first.
 */
export async function startExtract(): Promise<void> {
  const { setPicking, setSelection, setTool } = useApp.getState()
  setPicking(true)
  setTool('extract')
  try {
    const draft = await window.api.extract.select()
    if (draft) setSelection(draft)
  } catch (error) {
    fail(error)
  } finally {
    setPicking(false)
  }
}

export async function cancelExtract(): Promise<void> {
  await window.api.extract.cancel()
  useApp.getState().setPicking(false)
}

export async function saveSelection(): Promise<void> {
  const { selection, setSelection } = useApp.getState()
  if (!selection) return
  try {
    await window.api.extract.save(selection)
    await useLibrary.getState().refresh()
    setSelection(null)
    toast.success('Section saved', { description: selection.name })
  } catch (error) {
    fail(error)
  }
}

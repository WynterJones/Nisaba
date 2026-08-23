import { toast } from 'sonner'
import { useApp, useLibrary } from '@/store'

function fail(error: unknown): void {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/^Error: /, '')
    .replace(/^Error invoking remote method '[^']+': /, '')
  toast.error(message)
  // A toast is hidden behind the page view while browsing, so say it in the page too.
  void window.api.browser.flash(message, 'error')
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

export type ViewportPreset = 'mobile' | 'tablet' | 'desktop' | 'current'

export const captureViewport = (preset: ViewportPreset = 'current'): Promise<void> =>
  capture(() => window.api.capture.viewport(preset), 'Capture cancelled')

export const captureFullPage = (preset: ViewportPreset = 'current'): Promise<void> =>
  capture(() => window.api.capture.fullPage(preset), 'Capture cancelled')

export const captureRegion = (): Promise<void> =>
  capture(() => window.api.capture.region(), 'Region capture cancelled')

/**
 * Hands control to the page until the user picks an element or presses Escape.
 * The picked section lands in the inspector unsaved, so it can be reviewed first.
 */
export async function startExtract(): Promise<void> {
  const { setPicking, setSelection, setTool, openInspector } = useApp.getState()
  setPicking(true)
  setTool('extract')
  // The panel is where the selection shows up, so open it before handing over to the page.
  openInspector('inspect')
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

/** Profiles the whole page into an editable design pack. */
export async function profileDesign(): Promise<void> {
  const id = toast.loading('Reading the page design…')
  try {
    const record = await window.api.design.profile()
    await useLibrary.getState().refresh()
    toast.success('Design profile saved', { id, description: record.name })
  } catch (error) {
    toast.dismiss(id)
    fail(error)
  }
}

export async function detectElements(): Promise<import('../../preload').ElementCandidate[]> {
  try {
    return await window.api.elements.detect()
  } catch (error) {
    fail(error)
    return []
  }
}

export async function saveElements(
  candidates: import('../../preload').ElementCandidate[]
): Promise<void> {
  const id = toast.loading(`Capturing ${candidates.length} element(s)…`)
  try {
    const saved = await window.api.elements.save(candidates)
    await useLibrary.getState().refresh()
    toast.success(`Saved ${saved.length} element${saved.length === 1 ? '' : 's'}`, { id })
  } catch (error) {
    toast.dismiss(id)
    fail(error)
  }
}

export function classifyResource(url: string): import('../../preload').ResourceRecord['type'] {
  const value = url.toLowerCase()
  if (/github\.com|gitlab\.com|bitbucket/.test(value)) return 'repository'
  if (/icon|lucide|heroicons|phosphor|feather|fontawesome|iconify/.test(value)) return 'icons'
  if (/font|typekit|typography|typeface/.test(value)) return 'fonts'
  if (/ui\.|shadcn|radix|chakra|mantine|headlessui|daisyui|component/.test(value)) return 'ui-kit'
  if (/dribbble|behance|awwwards|land-book|godly|refero|mobbin/.test(value)) return 'inspiration'
  if (/figma|framer|webflow|linear|notion|vercel/.test(value)) return 'tool'
  return 'other'
}

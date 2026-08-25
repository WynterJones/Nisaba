import { toast } from 'sonner'
import { useApp, useLibrary } from '@/store'
import { useTerminals } from '@/terminals'

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
    toast.success('Saved to Captures', { description: record.kind })
  } catch (error) {
    fail(error)
  }
}

export type ViewportPreset = 'mobile' | 'tablet' | 'desktop' | 'current'

export const captureViewport = (preset: ViewportPreset = 'desktop'): Promise<void> =>
  capture(() => window.api.capture.viewport(preset), 'Capture cancelled')

export const captureFullPage = (preset: ViewportPreset = 'desktop'): Promise<void> =>
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
    if (!draft) return
    setSelection(draft)
    // One button, one flow: a picked section lands on the tab that can actually build it.
    openInspector('ai')
  } catch (error) {
    fail(error)
  } finally {
    setPicking(false)
  }
}

/**
 * Picks an element and saves it straight to Captures. This is the Capture-menu path —
 * Extract is the separate one that loads the inspector for converting.
 */
export async function captureElement(): Promise<void> {
  const { setPicking } = useApp.getState()
  setPicking(true)
  try {
    const draft = await window.api.extract.select('element')
    if (!draft) return
    const record = await window.api.capture.rect(draft.rect)
    if (record) {
      await useLibrary.getState().refresh()
      toast.success('Saved to Captures', { description: 'element' })
    }
  } catch (error) {
    fail(error)
  } finally {
    setPicking(false)
  }
}

/**
 * Captures the whole page as a template source and files it, then opens the inspector so it
 * can be converted. A page is just a section rooted at <body>, so everything downstream — the
 * source package, the prompt, the job — is the section pipeline unchanged.
 */
export async function captureWholePage(): Promise<void> {
  const id = toast.loading('Reading the whole page…')
  try {
    const draft = await window.api.extract.page()
    if (!draft) return void toast.dismiss(id)
    const record = await window.api.extract.save(draft)
    await useLibrary.getState().refresh()
    const { setSelection, openInspector } = useApp.getState()
    setSelection(draft)
    openInspector('ai')
    toast.success('Page captured', { id, description: `${record.outline?.length ?? 0} blocks — convert it to a template` })
  } catch (error) {
    toast.dismiss(id)
    fail(error)
  }
}

export async function cancelExtract(): Promise<void> {
  await window.api.extract.cancel()
  useApp.getState().setPicking(false)
}

/** Files the current selection so an agent job has something on disk to read. */
export async function saveSelection(): Promise<import('../../preload').SectionRecord | null> {
  const { selection } = useApp.getState()
  if (!selection) return null
  try {
    const record = await window.api.extract.save(selection)
    await useLibrary.getState().refresh()
    return record
  } catch (error) {
    fail(error)
    return null
  }
}

/**
 * Writes the audit plan into its workspace and starts the agent on it in a live terminal,
 * so the run can be watched and answered rather than fired off blind.
 */
export async function implementAudit(
  record: import('../../preload').AuditRecord,
  agent?: import('../../preload').AgentId
): Promise<void> {
  try {
    const session = await window.api.audit.implement(record, agent)
    useTerminals.getState().show(session.id)
    toast.success('Agent started on this audit', { description: session.cwd })
  } catch (error) {
    fail(error)
  }
}

/**
 * Copies the whole plan as one prompt — tasks inlined, so it works pasted into an agent that
 * cannot read the exported folder.
 */
export async function copyAuditPrompt(
  record: import('../../preload').AuditRecord
): Promise<void> {
  try {
    await navigator.clipboard.writeText(
      await window.api.audit.prompt(record, record.exportedTo ?? null)
    )
    toast.success('Prompt copied', {
      description: `${record.pins.length} task(s) — paste it into any agent`
    })
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
    const missed = candidates.length - saved.length
    toast.success(`Saved ${saved.length} element${saved.length === 1 ? '' : 's'}`, {
      id,
      description: missed > 0 ? `${missed} could not be captured and were skipped` : undefined
    })
  } catch (error) {
    toast.dismiss(id)
    fail(error)
  }
}

/**
 * Every link in Nisaba's own UI opens in Nisaba. The address bar keeps a deliberate
 * "open in your default browser" escape hatch; nothing else should leave the app.
 */
export function openInApp(url: string): void {
  // A dialog may have left a frozen still over the viewport; clearing the overlay drops it.
  useApp.getState().setOverlay(false)
  useApp.getState().newTab(url)
  // HashRouter reads the hash directly, so this works outside a component.
  window.location.hash = '#/browse'
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

import { create } from 'zustand'
import { toast } from 'sonner'
import { useApp, useLibrary } from '@/store'
import type { AuditPin, AuditRecord } from '../../preload'

type Draft = Omit<AuditRecord, 'id' | 'createdAt'>

type AuditState = {
  active: boolean
  /** The pin whose note the panel is currently focused on. */
  focused: string | null
  draft: Draft | null
  /** Which pins are still being matched against the workspace. */
  locating: string[]
  savedId: string | null

  start: () => Promise<void>
  stop: () => Promise<void>
  update: (id: string, patch: Partial<AuditPin>) => void
  remove: (id: string) => Promise<void>
  focus: (id: string | null) => void
  save: () => Promise<AuditRecord | null>
  reset: () => void
}

const emptyDraft = (page: { url: string; title: string; host: string }, root: string | null): Draft => ({
  name: `${page.host} review`,
  url: page.url,
  title: page.title,
  host: page.host,
  viewport: { width: 0, height: 0 },
  workspaceRoot: root,
  pins: [],
  exportedTo: null
})

/** Picks the workspace whose folder most plausibly serves the page being reviewed. */
function guessWorkspaceRoot(url: string): string | null {
  const { workspaces } = useLibrary.getState()
  if (workspaces.length === 0) return null
  if (workspaces.length === 1) return workspaces[0].root
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  const name = host.replace(/^www\./, '').split('.')[0]
  return workspaces.find((w) => w.root.toLowerCase().includes(name))?.root ?? workspaces[0].root
}

export const useAudit = create<AuditState>((set, get) => ({
  active: false,
  focused: null,
  draft: null,
  locating: [],
  savedId: null,

  start: async () => {
    try {
      const page = await window.api.audit.start()
      const root = guessWorkspaceRoot(page.url)
      set({
        active: true,
        draft: get().draft ?? emptyDraft(page, root),
        savedId: null
      })
      useApp.getState().openInspector('inspect')

      // Each resolved pin immediately re-arms the next one, so the overlay stays live.
      void (async () => {
        while (get().active) {
          const pin = await window.api.audit.next().catch(() => null)
          if (!pin || !get().active) break

          const record: AuditPin = {
            id: pin.id,
            index: pin.index,
            note: '',
            category: 'other',
            priority: 'normal',
            status: 'open',
            selector: pin.context.selector,
            fallbacks: pin.context.fallbacks,
            tag: pin.context.tag,
            rect: pin.context.rect,
            text: pin.context.text,
            html: pin.context.html,
            styles: pin.context.styles,
            classes: pin.context.classes,
            elementId: pin.context.elementId,
            testId: pin.context.testId,
            ariaLabel: pin.context.ariaLabel,
            heading: pin.context.heading,
            landmark: pin.context.landmark,
            candidates: [],
            shot: pin.shot
          }

          set((s) => ({
            focused: record.id,
            draft: s.draft
              ? {
                  ...s.draft,
                  viewport: pin.context.viewport,
                  pins: [...s.draft.pins, record]
                }
              : s.draft
          }))

          // Resolving the source file is slow; do it in the background per pin.
          const workspaceRoot = get().draft?.workspaceRoot
          if (workspaceRoot && pin.context.needles.length) {
            set((s) => ({ locating: [...s.locating, record.id] }))
            void window.api.audit
              .locate(workspaceRoot, pin.context.needles)
              .then((candidates) => get().update(record.id, { candidates }))
              .catch(() => undefined)
              .finally(() => set((s) => ({ locating: s.locating.filter((x) => x !== record.id) })))
          }
        }
      })()
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
    }
  },

  stop: async () => {
    set({ active: false, focused: null })
    await window.api.audit.stop().catch(() => undefined)
  },

  update: (id, patch) =>
    set((s) => ({
      draft: s.draft
        ? { ...s.draft, pins: s.draft.pins.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
        : s.draft
    })),

  remove: async (id) => {
    await window.api.audit.remove(id).catch(() => undefined)
    set((s) => ({
      focused: s.focused === id ? null : s.focused,
      draft: s.draft
        ? {
            ...s.draft,
            pins: s.draft.pins.filter((p) => p.id !== id).map((p, i) => ({ ...p, index: i + 1 }))
          }
        : s.draft
    }))
  },

  focus: (focused) => set({ focused }),

  save: async () => {
    const { draft, savedId } = get()
    if (!draft || draft.pins.length === 0) return null

    if (savedId) {
      await window.api.library.patch('audits', savedId, draft)
      await useLibrary.getState().refresh()
      return useLibrary.getState().audits.find((r) => r.id === savedId) ?? null
    }

    const record = await window.api.library.add<AuditRecord>('audits', {
      ...draft,
      id: `rl-${Date.now()}`,
      createdAt: Date.now()
    })
    set({ savedId: record.id })
    await useLibrary.getState().refresh()
    return record
  },

  reset: () => set({ active: false, focused: null, draft: null, savedId: null, locating: [] })
}))

export const CATEGORIES: { id: AuditPin['category']; label: string }[] = [
  { id: 'bug', label: 'Bug' },
  { id: 'layout', label: 'Layout' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'typography', label: 'Type' },
  { id: 'color', label: 'Colour' },
  { id: 'copy', label: 'Copy' },
  { id: 'content', label: 'Content' },
  { id: 'a11y', label: 'A11y' },
  { id: 'responsive', label: 'Responsive' },
  { id: 'other', label: 'Other' }
]

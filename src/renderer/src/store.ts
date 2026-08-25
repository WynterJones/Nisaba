import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  CaptureRecord,
  Collection,
  ComponentRecord,
  DesignSystemRecord,
  ElementRecord,
  JobRecord,
  AuditRecord,
  ResourceRecord,
  SectionDraft,
  SectionRecord,
  TabState,
  TemplateRecord,
  WorkspaceRecord
} from '../../preload'

export type Tool = 'capture' | 'extract' | 'convert' | null

export type Bookmark = {
  id: string
  url: string
  title: string
  addedAt: number
}

let seq = 0
const nextId = (): string => `tab-${++seq}`

export const HOME_URL = 'https://linear.app'

type AppState = {
  tabs: TabState[]
  activeTabId: string | null
  tool: Tool
  /** Which inspector tab is showing, so the toolbar can switch it. */
  inspectorTab: 'inspect' | 'assets' | 'ai'
  /** The section currently picked out of a live page, before it is saved. */
  selection: SectionDraft | null
  picking: boolean
  inspectorOpen: boolean
  sidebarCollapsed: boolean
  jobsOpen: boolean

  newTab: (url?: string, background?: boolean) => string
  closeTab: (id: string) => void
  activateTab: (id: string) => void
  patchTab: (patch: Partial<TabState> & { id: string }) => void
  setTool: (tool: Tool) => void
  setInspectorTab: (tab: 'inspect' | 'assets' | 'ai') => void
  openInspector: (tab: 'inspect' | 'assets' | 'ai') => void
  setSelection: (selection: SectionDraft | null) => void
  setPicking: (picking: boolean) => void
  toggleInspector: () => void
  toggleSidebar: () => void
  setJobsOpen: (open: boolean) => void
  /** True only while the Browse route is showing its viewport host. */
  viewportMounted: boolean
  setViewportMounted: (mounted: boolean) => void
  /** Device width the browsed page is laid out at, in px. Null fills the pane. */
  viewportWidth: number | null
  setViewportWidth: (width: number | null) => void
  /** Native views paint above all renderer HTML, so modals must hide them while open. */
  setOverlay: (open: boolean) => void
  /** Still of the hidden page, blurred behind whatever UI is covering it. */
  overlayShot: string | null
}

const blankTab = (id: string, url: string): TabState => ({
  id,
  url,
  title: url ? 'Loading…' : 'New tab',
  favicon: null,
  loading: Boolean(url),
  canGoBack: false,
  canGoForward: false,
  error: null
})

/** Trailing slashes and in-page anchors are the same document; anything else is not. */
function sameDocument(a: string, b: string): boolean {
  const strip = (url: string): string => url.split('#')[0].replace(/\/$/, '')
  return strip(a) === strip(b)
}

/**
 * A selection describes a region of one specific page. Once the active tab has navigated
 * somewhere else — or been closed, or swapped for another tab — the inspector would be
 * showing markup that is no longer on screen, so drop it instead of letting it go stale.
 */
function liveSelection(
  selection: SectionDraft | null,
  tabs: TabState[],
  activeTabId: string | null
): SectionDraft | null {
  if (!selection) return null
  const active = tabs.find((t) => t.id === activeTabId)
  return active && sameDocument(active.url, selection.url) ? selection : null
}

export const useApp = create<AppState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  tool: null,
  inspectorTab: 'inspect',
  selection: null,
  picking: false,
  // Both panels start collapsed — the page is what you came for.
  inspectorOpen: false,
  sidebarCollapsed: false,
  jobsOpen: false,
  viewportMounted: false,
  viewportWidth: null,
  overlayShot: null,

  newTab: (url = '', background = false) => {
    const id = nextId()
    // A background tab still takes the viewport when there is nothing else in it to show.
    const activate = !background || get().activeTabId === null
    set((s) => ({
      tabs: [...s.tabs, blankTab(id, url)],
      activeTabId: activate ? id : s.activeTabId
    }))
    void window.api.browser.open(id, url, activate)
    return id
  },

  closeTab: (id) => {
    void window.api.browser.close(id)
    const { tabs, activeTabId, selection } = get()
    const remaining = tabs.filter((t) => t.id !== id)
    const nextActive =
      activeTabId === id ? (remaining[remaining.length - 1]?.id ?? null) : activeTabId
    set({
      tabs: remaining,
      activeTabId: nextActive,
      selection: liveSelection(selection, remaining, nextActive)
    })
    if (nextActive) void window.api.browser.activate(nextActive)
  },

  activateTab: (id) => {
    set((s) => ({ activeTabId: id, selection: liveSelection(s.selection, s.tabs, id) }))
    void window.api.browser.activate(id)
  },

  patchTab: (patch) =>
    set((s) => {
      const tabs = s.tabs.map((t) => (t.id === patch.id ? { ...t, ...patch } : t))
      return { tabs, selection: liveSelection(s.selection, tabs, s.activeTabId) }
    }),

  setTool: (tool) => set((s) => ({ tool: s.tool === tool ? null : tool })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  openInspector: (inspectorTab) => set({ inspectorTab, inspectorOpen: true }),
  setSelection: (selection) => set({ selection }),
  setPicking: (picking) => set({ picking }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setJobsOpen: (jobsOpen) => set({ jobsOpen }),

  setViewportMounted: (viewportMounted) => set({ viewportMounted }),
  setViewportWidth: (viewportWidth) => set({ viewportWidth }),

  setOverlay: (open) => {
    const { activeTabId, viewportMounted } = get()
    // The still stays up until the page comes back, so UI never sits on a black rectangle.
    if (open)
      void window.api.browser.hideAll().then((shot) => shot && set({ overlayShot: shot }))
    // Only bring the page back if a viewport is actually on screen to hold it — otherwise
    // it would paint over whichever library route the user is really looking at.
    else {
      set({ overlayShot: null })
      if (activeTabId && viewportMounted) void window.api.browser.activate(activeTabId)
    }
  }
}))

export const useActiveTab = (): TabState | undefined =>
  useApp((s) => s.tabs.find((t) => t.id === s.activeTabId))

/**
 * Bookmarks live in their own store so they can persist independently of session state.
 * ponytail: localStorage until Phase 4's SQLite repositories land — same shape, different backend.
 */
type BookmarkState = {
  bookmarks: Bookmark[]
  addUrls: (input: string) => { added: number; skipped: number }
  remove: (id: string) => void
}

/** Splits a pasted block into one candidate URL per line, ignoring blanks and comments. */
export function parseUrlList(input: string): string[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(line) ? line : `https://${line}`))
    .filter((line) => URL.canParse(line))
}

export const useBookmarks = create<BookmarkState>()(
  persist(
    (set, get) => ({
      bookmarks: [],

      addUrls: (input) => {
        const urls = parseUrlList(input)
        const existing = new Set(get().bookmarks.map((b) => b.url))
        const fresh = urls.filter((url) => !existing.has(url) && existing.add(url))
        set((s) => ({
          bookmarks: [
            ...fresh.map((url, i) => ({
              id: `bm-${Date.now()}-${i}`,
              url,
              title: new URL(url).hostname.replace(/^www\./, ''),
              addedAt: Date.now()
            })),
            ...s.bookmarks
          ]
        }))
        return { added: fresh.length, skipped: urls.length - fresh.length }
      },

      remove: (id) => set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }))
    }),
    { name: 'nisaba.bookmarks' }
  )
)

/** Mirror of the on-disk library index; every mutation goes through main and re-reads. */
type LibraryState = {
  captures: CaptureRecord[]
  sections: SectionRecord[]
  elements: ElementRecord[]
  designSystems: DesignSystemRecord[]
  resources: ResourceRecord[]
  workspaces: WorkspaceRecord[]
  jobs: JobRecord[]
  components: ComponentRecord[]
  templates: TemplateRecord[]
  audits: AuditRecord[]
  loaded: boolean
  refresh: () => Promise<void>
  remove: (kind: Collection, id: string) => Promise<void>
}

export const useLibrary = create<LibraryState>((set, get) => ({
  captures: [],
  sections: [],
  elements: [],
  designSystems: [],
  resources: [],
  workspaces: [],
  jobs: [],
  components: [],
  templates: [],
  audits: [],
  loaded: false,

  refresh: async () => {
    const index = await window.api.library.read()
    set({ ...index, loaded: true })
  },

  remove: async (kind, id) => {
    await window.api.library.remove(kind, id)
    await get().refresh()
  }
}))

/** Sites are derived from what you actually captured, not stored separately. */
export type SiteSummary = {
  host: string
  captures: number
  sections: number
  lastSeen: number
  latestUrl: string
  /** Mirrors lastSeen so a site sorts alongside every other library record. */
  createdAt: number
}

export function useSites(): SiteSummary[] {
  const { captures, sections } = useLibrary()
  const map = new Map<string, SiteSummary>()

  const touch = (host: string, url: string, at: number): SiteSummary => {
    const existing =
      map.get(host) ?? { host, captures: 0, sections: 0, lastSeen: 0, createdAt: 0, latestUrl: url }
    if (at > existing.lastSeen) {
      existing.lastSeen = at
      existing.createdAt = at
      existing.latestUrl = url
    }
    map.set(host, existing)
    return existing
  }

  for (const c of captures) touch(c.host, c.url, c.createdAt).captures++
  for (const s of sections) touch(s.host, s.url, s.createdAt).sections++

  return [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen)
}

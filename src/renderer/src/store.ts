import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TabState } from '../../preload'

export type Tool = 'capture' | 'extract' | 'convert' | null

export type Bookmark = {
  id: string
  url: string
  title: string
  addedAt: number
}

export type Job = {
  id: string
  agent: string
  label: string
  progress: number
  status: 'running' | 'done' | 'failed'
}

let seq = 0
const nextId = (): string => `tab-${++seq}`

export const HOME_URL = 'https://linear.app'

type AppState = {
  tabs: TabState[]
  activeTabId: string | null
  tool: Tool
  inspectorOpen: boolean
  sidebarCollapsed: boolean
  jobsOpen: boolean
  jobs: Job[]

  newTab: (url?: string) => string
  closeTab: (id: string) => void
  activateTab: (id: string) => void
  patchTab: (patch: Partial<TabState> & { id: string }) => void
  setTool: (tool: Tool) => void
  toggleInspector: () => void
  toggleSidebar: () => void
  setJobsOpen: (open: boolean) => void
  dismissJob: (id: string) => void
  /** Native views paint above all renderer HTML, so modals must hide them while open. */
  setOverlay: (open: boolean) => void
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

export const useApp = create<AppState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  tool: null,
  inspectorOpen: true,
  sidebarCollapsed: false,
  jobsOpen: true,
  // ponytail: seeded so the jobs drawer has something to render before Phase 5 lands.
  jobs: [
    {
      id: 'job-seed',
      agent: 'Claude Code',
      label: 'Building React component',
      progress: 68,
      status: 'running'
    }
  ],

  newTab: (url = '') => {
    const id = nextId()
    set((s) => ({ tabs: [...s.tabs, blankTab(id, url)], activeTabId: id }))
    void window.api.browser.open(id, url)
    return id
  },

  closeTab: (id) => {
    void window.api.browser.close(id)
    const { tabs, activeTabId } = get()
    const remaining = tabs.filter((t) => t.id !== id)
    const nextActive =
      activeTabId === id ? (remaining[remaining.length - 1]?.id ?? null) : activeTabId
    set({ tabs: remaining, activeTabId: nextActive })
    if (nextActive) void window.api.browser.activate(nextActive)
  },

  activateTab: (id) => {
    set({ activeTabId: id })
    void window.api.browser.activate(id)
  },

  patchTab: (patch) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === patch.id ? { ...t, ...patch } : t)) })),

  setTool: (tool) => set((s) => ({ tool: s.tool === tool ? null : tool })),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setJobsOpen: (jobsOpen) => set({ jobsOpen }),
  dismissJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),

  setOverlay: (open) => {
    const { activeTabId } = get()
    if (open) void window.api.browser.hideAll()
    else if (activeTabId) void window.api.browser.activate(activeTabId)
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

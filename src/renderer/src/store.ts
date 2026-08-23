import { create } from 'zustand'
import type { TabState } from '../../preload'

export type Tool = 'capture' | 'extract' | 'convert' | null

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
  dismissJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }))
}))

export const useActiveTab = (): TabState | undefined =>
  useApp((s) => s.tabs.find((t) => t.id === s.activeTabId))

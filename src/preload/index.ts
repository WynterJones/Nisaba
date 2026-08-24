import { contextBridge, ipcRenderer } from 'electron'
import type {
  Annotation,
  CaptureRecord,
  Collection,
  ComponentRecord,
  DesignSystemRecord,
  ElementRecord,
  LibraryIndex,
  JobEvent,
  JobRecord,
  AuditPin,
  AuditRecord,
  ResourceRecord,
  SectionRecord,
  TemplateRecord,
  WorkspaceRecord
} from '../main/library'
import type { SectionDraft } from '../main/extract'
import type { AgentInstallation } from '../main/agents'
import type { ElementCandidate } from '../main/elements'
import type { WorkspaceProbe } from '../main/workspaces'
import type { PinContext } from '../main/audit'
import type { Needle, SourceMatch } from '../main/sourcemap'
import type { SimilarHit } from '../main/similarity'
import type { Check, PreviewState } from '../main/verify'
import type { UpdateState } from '../main/updater'
import type { TerminalSummary } from '../main/terminals'
import type { DesignSpec, Levels } from '../shared/design-spec'

export type { Check, DesignSpec, Levels, PreviewState, SimilarHit, TerminalSummary, UpdateState }

export type { PinContext, SourceMatch }

export type {
  AgentInstallation,
  Annotation,
  CaptureRecord,
  Collection,
  ComponentRecord,
  DesignSystemRecord,
  ElementCandidate,
  ElementRecord,
  JobEvent,
  JobRecord,
  LibraryIndex,
  AuditPin,
  AuditRecord,
  ResourceRecord,
  SectionDraft,
  SectionRecord,
  TemplateRecord,
  WorkspaceProbe,
  WorkspaceRecord
}

export type TabState = {
  id: string
  url: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
}

export type Bounds = { x: number; y: number; width: number; height: number }

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

/** Wraps `ipcRenderer.on` so every subscriber gets a disposer instead of leaking. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

const api = {
  getVersion: (): Promise<string> => invoke('app:version'),
  getPlatform: (): Promise<NodeJS.Platform> => invoke('app:platform'),

  window: {
    minimize: (): Promise<void> => invoke('window:minimize'),
    maximize: (): Promise<void> => invoke('window:maximize'),
    close: (): Promise<void> => invoke('window:close'),
    onStateChange: (cb: (maximized: boolean) => void): (() => void) =>
      subscribe('window:state', cb)
  },

  capture: {
    viewport: (preset = 'current'): Promise<CaptureRecord | null> =>
      invoke('capture:viewport', preset),
    fullPage: (preset = 'current'): Promise<CaptureRecord | null> =>
      invoke('capture:fullpage', preset),
    region: (): Promise<CaptureRecord | null> => invoke('capture:region'),
    rect: (rect: Bounds): Promise<CaptureRecord | null> => invoke('capture:rect', rect)
  },

  extract: {
    select: (): Promise<SectionDraft | null> => invoke('extract:select'),
    /** The whole page as one template source — same shape as a section, rooted at <body>. */
    page: (): Promise<SectionDraft | null> => invoke('extract:page'),
    cancel: (): Promise<void> => invoke('extract:cancel'),
    save: (draft: SectionDraft): Promise<SectionRecord> => invoke('extract:save', draft)
  },

  design: {
    profile: (): Promise<DesignSystemRecord> => invoke('design:profile'),
    /** Re-emits DESIGN.md at new shape/density/emphasis levels and files it back. */
    restyle: (record: DesignSystemRecord, levels: Levels): Promise<string> =>
      invoke('design:restyle', record, levels)
  },

  elements: {
    detect: (): Promise<ElementCandidate[]> => invoke('elements:detect'),
    save: (candidates: ElementCandidate[]): Promise<ElementRecord[]> =>
      invoke('elements:save', candidates)
  },

  workspaces: {
    pick: (): Promise<string | null> => invoke('workspaces:pick'),
    probe: (root: string): Promise<WorkspaceProbe> => invoke('workspaces:probe', root),
    create: (input: Omit<WorkspaceRecord, 'id' | 'createdAt'>): Promise<WorkspaceRecord> =>
      invoke('workspaces:create', input),
    reveal: (root: string): Promise<void> => invoke('workspaces:reveal', root)
  },

  jobs: {
    preview: (input: {
      workspaceId: string
      profile: string
      sourceIds: string[]
      extra: string
      kind: 'component' | 'template'
    }): Promise<{ prompt: string; sourceDir: string; root: string; agent: string }> =>
      invoke('jobs:preview', input),
    run: (input: {
      workspaceId: string
      profile: string
      sourceIds: string[]
      extra: string
      kind: 'component' | 'template'
      binary: string
      name: string
    }): Promise<JobRecord> => invoke('jobs:run', input),
    cancel: (id: string): Promise<void> => invoke('jobs:cancel', id),
    open: (dir: string, file?: string): Promise<void> => invoke('jobs:open', dir, file),
    reveal: (dir: string, file: string): Promise<void> => invoke('jobs:reveal', dir, file),
    readFile: (dir: string, file: string): Promise<string> => invoke('jobs:read-file', dir, file),
    onEvent: (cb: (payload: { id: string; event: JobEvent }) => void): (() => void) =>
      subscribe('jobs:event', cb),
    onDone: (cb: (payload: { id: string; status: JobRecord['status'] }) => void): (() => void) =>
      subscribe('jobs:done', cb)
  },

  audit: {
    start: (): Promise<{ url: string; title: string; host: string }> => invoke('audit:start'),
    /** Resolves with the next pin the user drops, or null when they finish. */
    next: (): Promise<{ id: string; index: number; context: PinContext; shot: string | null } | null> =>
      invoke('audit:next'),
    remove: (id: string): Promise<boolean> => invoke('audit:remove', id),
    stop: (): Promise<void> => invoke('audit:stop'),
    locate: (root: string, needles: Needle[]): Promise<SourceMatch[]> =>
      invoke('sourcemap:locate', root, needles),
    export: (
      record: AuditRecord,
      suggestedRoot: string | null
    ): Promise<{ path: string; tasks: number; shots: number } | null> =>
      invoke('audit:export', record, suggestedRoot),
    /** Writes the plan into the workspace and starts an agent on it in a live terminal. */
    implement: (record: AuditRecord, binary?: string): Promise<TerminalSummary> =>
      invoke('audit:implement', record, binary)
  },

  terminal: {
    list: (): Promise<TerminalSummary[]> => invoke('terminal:list'),
    shell: (cwd?: string): Promise<TerminalSummary> => invoke('terminal:shell', cwd),
    attach: (id: string): Promise<{ summary: TerminalSummary; scrollback: string } | null> =>
      invoke('terminal:attach', id),
    input: (id: string, data: string): Promise<void> => invoke('terminal:input', id, data),
    resize: (id: string, cols: number, rows: number): Promise<void> =>
      invoke('terminal:resize', id, cols, rows),
    kill: (id: string): Promise<void> => invoke('terminal:kill', id),
    close: (id: string): Promise<void> => invoke('terminal:close', id),
    onOpened: (cb: (summary: TerminalSummary) => void): (() => void) =>
      subscribe('terminal:opened', cb),
    onData: (cb: (payload: { id: string; data: string }) => void): (() => void) =>
      subscribe('terminal:data', cb),
    onExit: (cb: (payload: { id: string; exitCode: number }) => void): (() => void) =>
      subscribe('terminal:exit', cb),
    onClosed: (cb: (payload: { id: string }) => void): (() => void) =>
      subscribe('terminal:closed', cb)
  },

  similar: {
    index: (): Promise<number> => invoke('similar:index'),
    find: (input: { collection: Collection; id: string; limit?: number }): Promise<SimilarHit[]> =>
      invoke('similar:find', input),
    duplicates: (): Promise<[SimilarHit, SimilarHit][]> => invoke('similar:duplicates')
  },

  verify: {
    suggest: (root: string): Promise<Check[]> => invoke('verify:suggest', root),
    run: (input: { root: string; checks: Check[]; componentId: string }): Promise<Check[]> =>
      invoke('verify:run', input),
    onProgress: (cb: (p: { componentId: string; checks: Check[] }) => void): (() => void) =>
      subscribe('verify:progress', cb)
  },

  preview: {
    suggest: (root: string): Promise<string | null> => invoke('preview:suggest', root),
    start: (input: { workspaceId: string; root: string; command: string }): Promise<PreviewState> =>
      invoke('preview:start', input),
    stop: (workspaceId: string): Promise<void> => invoke('preview:stop', workspaceId),
    state: (workspaceId: string): Promise<PreviewState | null> => invoke('preview:state', workspaceId),
    onState: (cb: (p: { workspaceId: string; state: PreviewState }) => void): (() => void) =>
      subscribe('preview:state', cb)
  },

  library: {
    read: (): Promise<LibraryIndex> => invoke('library:read'),
    root: (): Promise<string> => invoke('library:root'),
    add: <T>(kind: Collection, record: T): Promise<T> => invoke('library:add', kind, record),
    patch: (kind: Collection, id: string, patch: object): Promise<void> =>
      invoke('library:patch', kind, id, patch),
    remove: (kind: Collection, id: string): Promise<void> => invoke('library:delete', kind, id),
    reveal: (file: string): Promise<void> => invoke('library:reveal', file),
    saveImage: (dataUrl: string, suggested: string): Promise<string | null> =>
      invoke('library:save-image', dataUrl, suggested),
    export: (ids: string[] | null): Promise<{ path: string; files: number } | null> =>
      invoke('library:export', ids),
    import: (): Promise<{ records: number; files: number } | null> => invoke('library:import'),
    /** Library assets are served over the app-only nisaba:// scheme. */
    url: (file: string): string => `nisaba://library/${file}`
  },

  agents: {
    detect: (): Promise<AgentInstallation[]> => invoke('agents:detect')
  },

  update: {
    state: (): Promise<UpdateState> => invoke('update:state'),
    check: (): Promise<UpdateState> => invoke('update:check'),
    install: (): Promise<void> => invoke('update:install'),
    onState: (cb: (state: UpdateState) => void): (() => void) => subscribe('update:state', cb)
  },

  browser: {
    open: (id: string, url: string): Promise<void> => invoke('browser:open', id, url),
    activate: (id: string): Promise<void> => invoke('browser:activate', id),
    close: (id: string): Promise<void> => invoke('browser:close', id),
    setBounds: (bounds: Bounds): Promise<void> => invoke('browser:set-bounds', bounds),
    hideAll: (): Promise<void> => invoke('browser:hide-all'),
    navigate: (url: string): Promise<void> => invoke('browser:navigate', url),
    back: (): Promise<void> => invoke('browser:back'),
    forward: (): Promise<void> => invoke('browser:forward'),
    reload: (): Promise<void> => invoke('browser:reload'),
    stop: (): Promise<void> => invoke('browser:stop'),
    openExternal: (url: string): Promise<void> => invoke('browser:open-external', url),
    flash: (text: string, tone: 'info' | 'error' = 'info'): Promise<void> =>
      invoke('browser:flash', text, tone),
    onTabUpdated: (cb: (patch: Partial<TabState> & { id: string }) => void): (() => void) =>
      subscribe('browser:tab-updated', cb)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

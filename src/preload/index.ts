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
import type { RefineState } from '../main/design-refine'
import type { Needle, SourceMatch } from '../main/sourcemap'
import type { SimilarHit } from '../main/similarity'
import type { Check, PreviewState } from '../main/verify'
import type { UpdateState } from '../main/updater'
import type { TerminalSummary } from '../main/terminals'
import type { DesignSpec, Levels } from '../shared/design-spec'

export type {
  Check,
  DesignSpec,
  Levels,
  PreviewState,
  RefineState,
  SimilarHit,
  TerminalSummary,
  UpdateState
}

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
    select: (mode?: 'section' | 'element'): Promise<SectionDraft | null> =>
      invoke('extract:select', mode ?? 'section'),
    /** The whole page as one template source — same shape as a section, rooted at <body>. */
    page: (): Promise<SectionDraft | null> => invoke('extract:page'),
    cancel: (): Promise<void> => invoke('extract:cancel'),
    save: (draft: SectionDraft): Promise<SectionRecord> => invoke('extract:save', draft)
  },

  resources: {
    /**
     * Opens the user's agent in a terminal with the resource list in front of it. It asks what
     * they are building, finds links, and appends them — Nisaba imports as the file changes.
     */
    curate: (): Promise<TerminalSummary> => invoke('resources:curate'),
    /** Fires each time the agent's writes land in the library. */
    onAdded: (cb: (added: number) => void): (() => void) => subscribe('resources:added', cb)
  },

  design: {
    profile: (): Promise<DesignSystemRecord> => invoke('design:profile'),
    /** Re-emits DESIGN.md at new shape/density/emphasis levels and files it back. */
    restyle: (record: DesignSystemRecord, levels: Levels): Promise<string> =>
      invoke('design:restyle', record, levels),
    /**
     * Hands the measured profile to the user's agent CLI in a background terminal; it reads the
     * screenshot and the raw samples and writes back a corrected spec.
     */
    refine: (
      record: DesignSystemRecord,
      agent?: 'claude' | 'codex'
    ): Promise<RefineState & { terminal: TerminalSummary }> =>
      invoke('design:refine', record, agent),
    onRefined: (cb: (state: RefineState) => void): (() => void) =>
      subscribe('design:refined', cb)
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
    /** Re-probes the folder when `root` changes — it is the boundary jobs are held inside. */
    update: (
      id: string,
      patch: Partial<Omit<WorkspaceRecord, 'id' | 'createdAt'>>
    ): Promise<void> => invoke('workspaces:update', id, patch),
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
    /** `base` numbers the on-page pins from where a resumed audit left off. */
    start: (base = 0): Promise<{ url: string; title: string; host: string }> =>
      invoke('audit:start', base),
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
    /** The agent prompt for an already-exported plan, pointed at `planDir`. */
    prompt: (record: AuditRecord, planDir: string): Promise<string> =>
      invoke('audit:prompt', record, planDir),
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
    /**
     * Library assets are served over the app-only nisaba:// scheme. Pass `thumb` anywhere the
     * image is shown small — a grid tile or a row — or a full-page capture is decoded at full
     * size just to be drawn 240px wide.
     */
    url: (file: string, thumb = false): string =>
      `nisaba://library/${file}${thumb ? '?thumb' : ''}`
  },

  agents: {
    detect: (): Promise<AgentInstallation[]> => invoke('agents:detect')
  },

  update: {
    state: (): Promise<UpdateState> => invoke('update:state'),
    check: (): Promise<UpdateState> => invoke('update:check'),
    /** Fetches the update; safe to call twice — the second call joins the first. */
    download: (): Promise<UpdateState> => invoke('update:download'),
    /** Restarts into the version already downloaded. */
    install: (): Promise<UpdateState> => invoke('update:install'),
    onState: (cb: (state: UpdateState) => void): (() => void) => subscribe('update:state', cb)
  },

  browser: {
    open: (id: string, url: string, activate = true): Promise<void> =>
      invoke('browser:open', id, url, activate),
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
      subscribe('browser:tab-updated', cb),
    /** A link the page opened itself — middle-click, cmd-click, target=_blank or the menu. */
    onOpenTab: (cb: (request: { url: string; background: boolean }) => void): (() => void) =>
      subscribe('browser:open-tab', cb)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

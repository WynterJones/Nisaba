import { contextBridge, ipcRenderer } from 'electron'
import type { CaptureRecord, LibraryIndex, SectionRecord } from '../main/library'
import type { SectionDraft } from '../main/extract'
import type { AgentInstallation } from '../main/agents'

export type { CaptureRecord, LibraryIndex, SectionRecord, SectionDraft, AgentInstallation }

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

const api = {
  getVersion: (): Promise<string> => invoke('app:version'),
  getPlatform: (): Promise<NodeJS.Platform> => invoke('app:platform'),

  window: {
    minimize: (): Promise<void> => invoke('window:minimize'),
    maximize: (): Promise<void> => invoke('window:maximize'),
    close: (): Promise<void> => invoke('window:close'),
    onStateChange: (cb: (maximized: boolean) => void): (() => void) => {
      const listener = (_e: unknown, maximized: boolean): void => cb(maximized)
      ipcRenderer.on('window:state', listener)
      return () => ipcRenderer.off('window:state', listener)
    }
  },

  capture: {
    viewport: (): Promise<CaptureRecord | null> => invoke('capture:viewport'),
    fullPage: (): Promise<CaptureRecord | null> => invoke('capture:fullpage'),
    region: (): Promise<CaptureRecord | null> => invoke('capture:region'),
    rect: (rect: Bounds): Promise<CaptureRecord | null> => invoke('capture:rect', rect)
  },

  extract: {
    select: (): Promise<SectionDraft | null> => invoke('extract:select'),
    cancel: (): Promise<void> => invoke('extract:cancel'),
    save: (draft: SectionDraft): Promise<SectionRecord> => invoke('extract:save', draft)
  },

  library: {
    read: (): Promise<LibraryIndex> => invoke('library:read'),
    root: (): Promise<string> => invoke('library:root'),
    remove: (kind: 'captures' | 'sections', id: string): Promise<void> =>
      invoke('library:delete', kind, id),
    reveal: (file: string): Promise<void> => invoke('library:reveal', file),
    /** Library images are served over the app-only nisaba:// scheme. */
    url: (file: string): string => `nisaba://library/${file}`
  },

  agents: {
    detect: (): Promise<AgentInstallation[]> => invoke('agents:detect')
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
    onTabUpdated: (cb: (patch: Partial<TabState> & { id: string }) => void): (() => void) => {
      const listener = (_e: unknown, patch: Partial<TabState> & { id: string }): void => cb(patch)
      ipcRenderer.on('browser:tab-updated', listener)
      return () => ipcRenderer.off('browser:tab-updated', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api

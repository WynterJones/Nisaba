import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'none' | 'error'
  version: string | null
  percent: number
  notes: string | null
  error: string | null
  /** False in development, where there is no packaged app to replace. */
  supported: boolean
}

const state: UpdateState = {
  status: 'idle',
  version: null,
  percent: 0,
  notes: null,
  error: null,
  supported: app.isPackaged
}

function publish(): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:state', state)
}

function set(patch: Partial<UpdateState>): void {
  Object.assign(state, patch)
  publish()
}

export function registerUpdaterIpc(): void {
  // Downloading is the user's decision, so they can see what is coming before it arrives.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }))
  autoUpdater.on('update-available', (info) =>
    set({
      status: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes.slice(0, 2000) : null
    })
  )
  autoUpdater.on('update-not-available', () => set({ status: 'none', version: null }))
  autoUpdater.on('download-progress', (progress) =>
    set({ status: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    set({ status: 'ready', version: info.version, percent: 100 })
  )
  autoUpdater.on('error', (error) => set({ status: 'error', error: error.message }))

  ipcMain.handle('update:state', () => state)

  ipcMain.handle('update:check', async () => {
    if (!state.supported) {
      set({ status: 'none' })
      return state
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
    return state
  })

  /** One button: fetch it if we haven't, then restart into it. */
  ipcMain.handle('update:install', async () => {
    if (!state.supported) return
    if (state.status === 'ready') {
      autoUpdater.quitAndInstall()
      return
    }
    try {
      set({ status: 'downloading', percent: 0 })
      await autoUpdater.downloadUpdate()
      autoUpdater.quitAndInstall()
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  })

  // A quiet check a few seconds after launch, then once a day.
  if (state.supported) {
    setTimeout(() => void autoUpdater.checkForUpdates().catch(() => undefined), 6000)
    setInterval(() => void autoUpdater.checkForUpdates().catch(() => undefined), 24 * 60 * 60 * 1000)
  }
}

import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateState = {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'restarting'
    | 'none'
    | 'error'
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

/** The one download in flight, so a second click joins it instead of starting another. */
let download: Promise<void> | null = null

function publish(): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:state', state)
}

function set(patch: Partial<UpdateState>): void {
  Object.assign(state, patch)
  publish()
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // Builds packed before the publish block existed carry no app-update.yml, and the raw
  // ENOENT reads like a crash rather than "this copy cannot update itself".
  return /app-update\.yml/.test(message)
    ? 'This build has no update feed — download the latest release manually.'
    : message
}

export function registerUpdaterIpc(): void {
  // Downloading is the user's decision, so they can see what is coming before it arrives.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    // A background re-check must not blank out a download the user is watching.
    if (state.status === 'downloading' || state.status === 'ready') return
    set({ status: 'checking', error: null })
  })
  autoUpdater.on('update-available', (info) =>
    set({
      status: state.status === 'downloading' ? 'downloading' : 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes.slice(0, 2000) : null
    })
  )
  autoUpdater.on('update-not-available', () => {
    if (state.status === 'downloading' || state.status === 'ready') return
    set({ status: 'none', version: null })
  })
  autoUpdater.on('download-progress', (progress) =>
    set({ status: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    set({ status: 'ready', version: info.version, percent: 100 })
  )
  autoUpdater.on('error', (error) => set({ status: 'error', error: describe(error) }))

  ipcMain.handle('update:state', () => state)

  ipcMain.handle('update:check', async () => {
    if (!state.supported) {
      set({ status: 'none' })
      return state
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      set({ status: 'error', error: describe(error) })
    }
    return state
  })

  /** Fetch it if we haven't. Idempotent: extra clicks join the download already running. */
  ipcMain.handle('update:download', async () => {
    if (!state.supported || state.status === 'ready') return state
    if (!download) {
      download = (async () => {
        try {
          set({ status: 'downloading', percent: 0, error: null })
          // electron-updater can only download what a check in *this* process resolved. A
          // stale "available" from an earlier session is why the first click used to no-op.
          await autoUpdater.checkForUpdates()
          await autoUpdater.downloadUpdate()
        } catch (error) {
          set({ status: 'error', error: describe(error) })
        } finally {
          download = null
        }
      })()
    }
    await download
    return state
  })

  /** Restart into the version already on disk. */
  ipcMain.handle('update:install', () => {
    if (!state.supported || state.status !== 'ready') return state
    set({ status: 'restarting' })
    // isSilent false, isForceRunAfter true — otherwise macOS quits without coming back.
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 400)
    return state
  })

  // A quiet check a few seconds after launch, then once a day.
  if (state.supported) {
    setTimeout(() => void autoUpdater.checkForUpdates().catch(() => undefined), 6000)
    setInterval(() => void autoUpdater.checkForUpdates().catch(() => undefined), 24 * 60 * 60 * 1000)
  }
}

import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { registerBrowserIpc } from './browser'
import { registerCaptureIpc } from './capture'
import { registerExtractIpc } from './extract'
import { registerAgentIpc } from './agents'
import {
  libraryRoot,
  readIndex,
  registerLibraryProtocol,
  registerLibraryProtocolScheme,
  removeRecord,
  revealRecord
} from './library'

registerLibraryProtocolScheme()

/**
 * A second instance would keep its own copy of the library index and clobber the first
 * one's writes. Focus the existing window instead.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#0d0d0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const emitWindowState = (): void => win.webContents.send('window:state', win.isMaximized())
  win.on('maximize', emitWindowState)
  win.on('unmaximize', emitWindowState)
  win.on('enter-full-screen', emitWindowState)
  win.on('leave-full-screen', emitWindowState)

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerBrowserIpc(win)
  return win
}

app.whenReady().then(() => {
  registerLibraryProtocol()
  registerCaptureIpc()
  registerExtractIpc()
  registerAgentIpc()

  ipcMain.handle('library:read', () => readIndex())
  ipcMain.handle('library:root', () => libraryRoot())
  ipcMain.handle('library:delete', (_e, kind: 'captures' | 'sections', id: string) =>
    removeRecord(kind, id)
  )
  ipcMain.handle('library:reveal', (_e, file: string) => revealRecord(file))

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)
  ipcMain.handle('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.handle('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
  })
  ipcMain.handle('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  if (app.isPackaged) void autoUpdater.checkForUpdatesAndNotify()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

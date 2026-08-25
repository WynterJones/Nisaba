import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { registerUpdaterIpc } from './updater'
import { registerBrowserIpc } from './browser'
import { registerCaptureIpc } from './capture'
import { registerExtractIpc } from './extract'
import { registerAgentIpc } from './agents'
import { registerDesignIpc } from './design'
import { registerDesignRefineIpc } from './design-refine'
import { registerElementIpc } from './elements'
import { registerWorkspaceIpc } from './workspaces'
import { registerJobIpc, reconcileJobs } from './jobs'
import { registerExportIpc } from './exporter'
import { registerAuditIpc } from './audit'
import { registerAuditExportIpc } from './audit-export'
import { registerSourceMapIpc } from './sourcemap'
import { registerSimilarityIpc } from './similarity'
import { registerVerifyIpc, stopAllPreviews } from './verify'
import { killAllTerminals, registerTerminalIpc } from './terminals'
import { registerAppContextMenu } from './context-menu'
import { registerCuratorIpc } from './curator'
import { writeFile } from 'fs/promises'
import {
  addRecord,
  libraryRoot,
  patchRecord,
  readIndex,
  registerLibraryProtocol,
  registerLibraryProtocolScheme,
  removeRecord,
  revealRecord,
  type Collection
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
  registerAppContextMenu(win)
  return win
}

app.whenReady().then(() => {
  registerLibraryProtocol()
  registerCaptureIpc()
  registerExtractIpc()
  registerAgentIpc()
  registerDesignIpc()
  registerDesignRefineIpc()
  registerElementIpc()
  registerWorkspaceIpc()
  registerJobIpc()
  registerExportIpc()
  registerAuditIpc()
  registerAuditExportIpc()
  registerSourceMapIpc()
  registerSimilarityIpc()
  registerVerifyIpc()
  registerTerminalIpc()
  registerCuratorIpc()
  void reconcileJobs()

  ipcMain.handle('library:read', () => readIndex())
  ipcMain.handle('library:root', () => libraryRoot())
  ipcMain.handle('library:delete', (_e, kind: Collection, id: string) => removeRecord(kind, id))
  ipcMain.handle('library:patch', (_e, kind: Collection, id: string, patch: object) =>
    patchRecord(kind, id, patch)
  )
  ipcMain.handle('library:reveal', (_e, file: string) => revealRecord(file))
  ipcMain.handle('library:add', (_e, kind: Collection, record: unknown) =>
    addRecord(kind, record as Parameters<typeof addRecord>[1])
  )

  /** Saves a flattened annotated image wherever the user points, leaving the original intact. */
  ipcMain.handle('library:save-image', async (e, dataUrl: string, suggested: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export image',
      defaultPath: suggested,
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, Buffer.from(dataUrl.split(',')[1], 'base64'))
    shell.showItemInFolder(result.filePath)
    return result.filePath
  })

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

  registerUpdaterIpc()
})

app.on('before-quit', () => {
  stopAllPreviews()
  killAllTerminals()
})

app.on('window-all-closed', () => {
  stopAllPreviews()
  killAllTerminals()
  if (process.platform !== 'darwin') app.quit()
})

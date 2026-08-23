import { BrowserWindow, WebContentsView, shell, ipcMain, session } from 'electron'

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

type Bounds = { x: number; y: number; width: number; height: number }

const views = new Map<string, WebContentsView>()
let activeId: string | null = null
let lastBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 }

/** Remote pages get their own partition and no preload — they can never reach app IPC. */
function remoteSession(): Electron.Session {
  const s = session.fromPartition('persist:nisaba-browse')
  // Default-deny every capability; Phase 5 brokers specific ones explicitly.
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  return s
}

function createView(win: BrowserWindow, id: string): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      session: remoteSession(),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  const wc = view.webContents
  const send = (patch: Partial<TabState>): void => {
    if (win.isDestroyed()) return
    win.webContents.send('browser:tab-updated', {
      id,
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      ...patch
    })
  }

  wc.setWindowOpenHandler(({ url }) => {
    // New windows are never granted; same-tab navigation or the system browser instead.
    if (url.startsWith('http')) wc.loadURL(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (!/^https?:|^about:blank$/.test(url)) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
  wc.on('did-start-loading', () => send({ loading: true, error: null }))
  wc.on('did-stop-loading', () => send({ loading: false, url: wc.getURL() }))
  wc.on('page-title-updated', (_e, title) => send({ title }))
  wc.on('page-favicon-updated', (_e, icons) => send({ favicon: icons[0] ?? null }))
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) send({ loading: false, error: `${desc} (${url})` })
  })

  views.set(id, view)
  return view
}

/** The remote view the user is currently looking at, if any. */
export function activeView(): WebContentsView | undefined {
  return activeId ? views.get(activeId) : undefined
}

/** Bounds of the page area in window coordinates — needed to place capture overlays. */
export function viewportBounds(): Bounds {
  return lastBounds
}

function layout(win: BrowserWindow): void {
  for (const [id, view] of views) {
    view.setVisible(id === activeId)
    if (id === activeId) view.setBounds(lastBounds)
  }
  void win
}

export function registerBrowserIpc(win: BrowserWindow): void {
  const handle = <T>(channel: string, fn: (...args: never[]) => T): void => {
    ipcMain.handle(channel, (_e, ...args) => fn(...(args as never[])))
  }
  const active = activeView

  handle('browser:open', (id: string, url: string) => {
    const view = views.get(id) ?? createView(win, id)
    if (!win.contentView.children.includes(view)) win.contentView.addChildView(view)
    activeId = id
    layout(win)
    if (url && view.webContents.getURL() !== url) void view.webContents.loadURL(url)
  })

  handle('browser:activate', (id: string) => {
    activeId = id
    layout(win)
  })

  handle('browser:close', (id: string) => {
    const view = views.get(id)
    if (!view) return
    win.contentView.removeChildView(view)
    view.webContents.close()
    views.delete(id)
    if (activeId === id) activeId = null
    layout(win)
  })

  handle('browser:set-bounds', (bounds: Bounds) => {
    lastBounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    }
    layout(win)
  })

  /** Hide every remote view — used when the app shows a library route instead of the browser. */
  handle('browser:hide-all', () => {
    activeId = null
    layout(win)
  })

  handle('browser:navigate', (url: string) => active()?.webContents.loadURL(url))
  handle('browser:back', () => active()?.webContents.navigationHistory.goBack())
  handle('browser:forward', () => active()?.webContents.navigationHistory.goForward())
  handle('browser:reload', () => active()?.webContents.reload())
  handle('browser:stop', () => active()?.webContents.stop())
  handle('browser:open-external', (url: string) => shell.openExternal(url))
}

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
/** Menus and dialogs hide the page without changing which tab is current. */
let hidden = false
/** Overrides `hidden` while a capture is in flight — the page must be composited to be shot. */
let forceVisible = false
let lastBounds: Bounds = { x: 0, y: 0, width: 0, height: 0 }
let mainWindow: BrowserWindow | null = null

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

/** The current tab's view, whether or not a menu is covering it. */
export function activeView(): WebContentsView | undefined {
  return activeId ? views.get(activeId) : undefined
}

/**
 * Makes the page visible long enough to be photographed, then restores it. A menu or dialog
 * may be covering it when a capture is triggered, and a hidden view composites to nothing.
 */
export async function withVisibleView<T>(fn: (view: WebContentsView) => Promise<T>): Promise<T> {
  const view = activeView()
  if (!view) throw new Error('Open a page before capturing')

  const wasHidden = hidden
  // Force visibility rather than trusting the flag: a view can also be unpainted because it
  // was added to the window before it had bounds, and capturePage has no surface either way.
  forceVisible = true
  view.setVisible(true)
  await new Promise((resolve) => setTimeout(resolve, wasHidden ? 120 : 40))

  try {
    return await fn(view)
  } finally {
    // Re-run layout instead of restoring the snapshot: the menu closing mid-capture already
    // asked for the page back, and re-hiding it here is what left a black panel on screen.
    forceVisible = false
    if (mainWindow && !mainWindow.isDestroyed()) layout(mainWindow)
    else view.setVisible(!hidden)
  }
}

/** Bounds of the page area in window coordinates — needed to place capture overlays. */
export function viewportBounds(): Bounds {
  return lastBounds
}

function layout(win: BrowserWindow): void {
  for (const [id, view] of views) {
    view.setVisible((forceVisible || !hidden) && id === activeId)
    if (id === activeId) view.setBounds(lastBounds)
  }
  void win
}

export function registerBrowserIpc(win: BrowserWindow): void {
  mainWindow = win
  const handle = <T>(channel: string, fn: (...args: never[]) => T): void => {
    ipcMain.handle(channel, (_e, ...args) => fn(...(args as never[])))
  }
  const active = activeView

  handle('browser:open', (id: string, url: string) => {
    const view = views.get(id) ?? createView(win, id)
    if (!win.contentView.children.includes(view)) win.contentView.addChildView(view)
    activeId = id
    hidden = false
    layout(win)
    if (url && view.webContents.getURL() !== url) void view.webContents.loadURL(url)
  })

  handle('browser:activate', (id: string) => {
    activeId = id
    hidden = false
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
    hidden = true
    layout(win)
  })

  handle('browser:navigate', (url: string) => active()?.webContents.loadURL(url))
  handle('browser:back', () => active()?.webContents.navigationHistory.goBack())
  handle('browser:forward', () => active()?.webContents.navigationHistory.goForward())
  handle('browser:reload', () => active()?.webContents.reload())
  handle('browser:stop', () => active()?.webContents.stop())
  handle('browser:open-external', (url: string) => shell.openExternal(url))

  /** Shows a message inside the page — the only place a user looking at a page will see it. */
  handle('browser:flash', (text: string, tone: 'info' | 'error') => {
    const view = activeView()
    if (!view) return
    const background = tone === 'error' ? '#7f1d2e' : '#7928db'
    const style = [
      'position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-8px)',
      'z-index:2147483647;max-width:70vw;color:#fff;font:600 13px system-ui',
      'padding:10px 16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5)',
      'opacity:0;transition:opacity .18s,transform .18s',
      'background:' + background
    ].join(';')

    // Built by concatenation rather than a nested template literal, which is far too easy
    // to mis-escape into a syntax error inside the page.
    const script =
      '(() => {' +
      'const el = document.createElement("div");' +
      'el.textContent = ' + JSON.stringify(text) + ';' +
      'el.style.cssText = ' + JSON.stringify(style) + ';' +
      'document.documentElement.appendChild(el);' +
      'requestAnimationFrame(() => { el.style.opacity = "1";' +
      ' el.style.transform = "translateX(-50%) translateY(0)"; });' +
      'setTimeout(() => { el.style.opacity = "0"; }, 3200);' +
      'setTimeout(() => el.remove(), 3500);' +
      '})()'

    view.webContents.executeJavaScript(script, true).catch(() => undefined)
  })
}

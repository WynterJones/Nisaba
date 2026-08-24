import { ipcMain, nativeImage, type WebContentsView } from 'electron'
import { activeView, withVisibleView } from './browser'
import { addRecord, hashImage, newId, writeImage, type CaptureRecord } from './library'

/** Full-page shots beyond this get clipped rather than exhausting memory. */
const MAX_FULLPAGE_HEIGHT = 20000

type Rect = { x: number; y: number; width: number; height: number }

function meta(view: WebContentsView): { url: string; title: string; host: string } {
  const url = view.webContents.getURL()
  let host = ''
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    host = 'unknown'
  }
  return { url, title: view.webContents.getTitle() || host, host }
}

type Shot = { png: Buffer; width: number; height: number }

/**
 * A view that has just been shown, resized or navigated may have no composited frame yet,
 * and Electron answers with "Current display surface not available". Give it a moment.
 */
async function grab(
  view: WebContentsView,
  rect?: Electron.Rectangle
): Promise<Electron.NativeImage> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await view.webContents.capturePage(rect)
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 140))
    }
  }

  // The compositor never offered a surface — ask the renderer itself instead. This is the
  // same path full-page capture uses, and it does not depend on the view being composited.
  const png = await captureViaCdp(view, rect)
  return nativeImage.createFromBuffer(png)
}

/** Screenshot straight from the page, clipped if a rect is given. */
async function captureViaCdp(view: WebContentsView, rect?: Electron.Rectangle): Promise<Buffer> {
  const wc = view.webContents
  const attachedHere = !wc.debugger.isAttached()
  if (attachedHere) wc.debugger.attach('1.3')
  try {
    const metrics = (await wc.debugger.sendCommand('Page.getLayoutMetrics')) as {
      cssVisualViewport?: { clientWidth: number; clientHeight: number }
      cssLayoutViewport?: { clientWidth: number; clientHeight: number }
    }
    const vp = metrics.cssVisualViewport ?? metrics.cssLayoutViewport
    const clip = rect
      ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 }
      : {
          x: 0,
          y: 0,
          width: Math.round(vp?.clientWidth ?? view.getBounds().width),
          height: Math.round(vp?.clientHeight ?? view.getBounds().height),
          scale: 1
        }

    const result = (await wc.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      clip
    })) as { data: string }
    return Buffer.from(result.data, 'base64')
  } finally {
    if (attachedHere && wc.debugger.isAttached()) {
      try {
        wc.debugger.detach()
      } catch {
        /* already detached */
      }
    }
  }
}

async function captureViewport(view: WebContentsView, rect?: Rect): Promise<Shot> {
  const image = await grab(
    view,
    rect
      ? {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      : undefined
  )
  const { width, height } = image.getSize()
  // A hidden or unlaid-out view composites to nothing; saving that would be a blank file.
  if (width === 0 || height === 0) {
    throw new Error('Nothing to capture — open the page in Browse first')
  }
  return { png: image.toPNG(), width, height }
}

/**
 * Beyond-viewport capture needs CDP; `capturePage` can only see what is composited.
 * The debugger is attached for the duration of the shot and always detached after.
 */
async function captureFullPage(view: WebContentsView): Promise<Shot> {
  const wc = view.webContents
  const attachedHere = !wc.debugger.isAttached()
  if (attachedHere) wc.debugger.attach('1.3')
  try {
    const metrics = (await wc.debugger.sendCommand('Page.getLayoutMetrics')) as {
      cssContentSize?: Rect
      contentSize?: Rect
    }
    const content = metrics.cssContentSize ?? metrics.contentSize
    if (!content) throw new Error('Could not measure the page')

    const result = (await wc.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: Math.round(content.width),
        height: Math.min(Math.round(content.height), MAX_FULLPAGE_HEIGHT),
        scale: 1
      }
    })) as { data: string }

    return {
      png: Buffer.from(result.data, 'base64'),
      width: Math.round(content.width),
      height: Math.min(Math.round(content.height), MAX_FULLPAGE_HEIGHT)
    }
  } finally {
    if (attachedHere && wc.debugger.isAttached()) wc.debugger.detach()
  }
}

/** Draws a drag-to-select overlay inside the page and resolves with the chosen rect. */
const REGION_PICKER = `(() => new Promise((resolve) => {
  const prev = document.getElementById('__nisaba_region__')
  if (prev) prev.remove()

  const layer = document.createElement('div')
  layer.id = '__nisaba_region__'
  layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(8,8,10,.45)'

  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;border:2px solid #a06bf0;background:rgba(121,40,219,.16);box-shadow:0 0 0 9999px rgba(8,8,10,.45);pointer-events:none;display:none'

  const hint = document.createElement('div')
  hint.textContent = 'Drag to select a region  ·  Esc to cancel'
  hint.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#0d0d0f;color:#eee;border:1px solid #2a2a31;border-radius:9px;padding:8px 14px;font:500 13px system-ui;pointer-events:none'

  document.documentElement.append(layer, box, hint)

  let start = null
  const done = (value) => {
    layer.remove(); box.remove(); hint.remove()
    window.removeEventListener('keydown', onKey, true)
    resolve(value)
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null) } }
  window.addEventListener('keydown', onKey, true)

  layer.addEventListener('mousedown', (e) => {
    start = { x: e.clientX, y: e.clientY }
    layer.style.background = 'transparent'
    box.style.display = 'block'
  })
  layer.addEventListener('mousemove', (e) => {
    if (!start) return
    const x = Math.min(start.x, e.clientX), y = Math.min(start.y, e.clientY)
    box.style.left = x + 'px'; box.style.top = y + 'px'
    box.style.width = Math.abs(e.clientX - start.x) + 'px'
    box.style.height = Math.abs(e.clientY - start.y) + 'px'
  })
  layer.addEventListener('mouseup', (e) => {
    if (!start) return done(null)
    const rect = {
      x: Math.min(start.x, e.clientX),
      y: Math.min(start.y, e.clientY),
      width: Math.abs(e.clientX - start.x),
      height: Math.abs(e.clientY - start.y)
    }
    done(rect.width > 8 && rect.height > 8 ? rect : null)
  })
}))()`

/** Confirmation has to render inside the page — no app HTML can paint over a native view. */
function flash(view: WebContentsView, message: string): void {
  const script = `(() => {
    const el = document.createElement('div')
    el.textContent = ${JSON.stringify(message)}
    el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(8px);z-index:2147483647;background:#7928db;color:#fff;font:600 13px system-ui;padding:10px 16px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);opacity:0;transition:opacity .18s,transform .18s'
    const sheet = document.createElement('div')
    sheet.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#fff;pointer-events:none;opacity:.55;transition:opacity .35s'
    document.documentElement.append(sheet, el)
    requestAnimationFrame(() => {
      sheet.style.opacity = '0'
      el.style.opacity = '1'
      el.style.transform = 'translateX(-50%) translateY(0)'
    })
    setTimeout(() => { el.style.opacity = '0'; sheet.remove() }, 1600)
    setTimeout(() => el.remove(), 1900)
  })()`
  view.webContents.executeJavaScript(script, true).catch(() => {
    /* page navigated away mid-capture; the shot is still saved */
  })
}

export const VIEWPORTS = {
  mobile: { label: 'Mobile', width: 390 },
  tablet: { label: 'Tablet', width: 834 },
  desktop: { label: 'Desktop', width: 1440 },
  current: { label: 'Current width', width: 0 }
} as const

export type ViewportName = keyof typeof VIEWPORTS

/**
 * Narrows the page to a preset width for the shot, then puts it back. The view keeps its
 * on-screen position so the resize is not visible as a jump.
 */
async function atWidth<T>(
  view: WebContentsView,
  width: number,
  fn: () => Promise<T>
): Promise<T> {
  const original = view.getBounds()
  if (!width || width === original.width) return fn()

  view.setBounds({ ...original, width })
  // Layout, then a frame to paint at the new width before the shutter.
  await new Promise((resolve) => setTimeout(resolve, 420))
  try {
    return await fn()
  } finally {
    view.setBounds(original)
  }
}

export function registerCaptureIpc(): void {

  // Every capture runs with the page guaranteed visible, because a menu or dialog may be
  // covering it at the moment the action fires.
  const withView = (
    fn: (view: WebContentsView) => Promise<CaptureRecord | null>
  ): Promise<CaptureRecord | null> => withVisibleView(fn)

  const save = async (
    view: WebContentsView,
    shot: Shot,
    kind: CaptureRecord['kind'],
    viewport: ViewportName = 'current'
  ): Promise<CaptureRecord> => {
    const id = newId()
    const record = await addRecord('captures', {
      id,
      createdAt: Date.now(),
      kind,
      ...meta(view),
      width: shot.width,
      height: shot.height,
      viewport: viewport === 'current' ? null : VIEWPORTS[viewport].label,
      file: await writeImage('captures', id, shot.png),
      phash: await hashImage(shot.png)
    })
    flash(view, `Saved to Captures · ${kind}`)
    return record
  }

  ipcMain.handle('capture:viewport', (_e, viewport: ViewportName = 'current') =>
    withView(async (view) =>
      atWidth(view, VIEWPORTS[viewport].width, async () =>
        save(view, await captureViewport(view), 'viewport', viewport)
      )
    )
  )

  ipcMain.handle('capture:fullpage', (_e, viewport: ViewportName = 'current') =>
    withView(async (view) =>
      atWidth(view, VIEWPORTS[viewport].width, async () =>
        save(view, await captureFullPage(view), 'fullpage', viewport)
      )
    )
  )

  ipcMain.handle('capture:region', () =>
    withView(async (view) => {
      const rect = (await view.webContents.executeJavaScript(REGION_PICKER, true)) as Rect | null
      if (!rect) return null
      return save(view, await captureViewport(view, rect), 'region')
    })
  )

  ipcMain.handle('capture:rect', (_e, rect: Rect) =>
    withView(async (view) => save(view, await captureViewport(view, rect), 'element'))
  )
}

/** Full-page PNG, for the whole-page extractor. Beyond-viewport capture needs CDP. */
export async function capturePageShot(): Promise<Buffer | null> {
  if (!activeView()) return null
  const shot = await withVisibleView((view) => captureFullPage(view))
  return shot.png
}

/** Used by the extractor and the auditor to grab just the selected element. */
export async function captureRect(rect: Rect): Promise<Buffer | null> {
  if (!activeView()) return null
  const shot = await withVisibleView((view) => captureViewport(view, rect))
  return shot.png
}

export { meta as pageMeta }

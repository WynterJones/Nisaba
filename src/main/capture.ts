import { ipcMain, type WebContentsView } from 'electron'
import { activeView } from './browser'
import { addCapture, type CaptureRecord } from './library'

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

async function captureViewport(view: WebContentsView, rect?: Rect): Promise<Shot> {
  const image = await view.webContents.capturePage(
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

export function registerCaptureIpc(): void {
  const withView = async (
    fn: (view: WebContentsView) => Promise<CaptureRecord | null>
  ): Promise<CaptureRecord | null> => {
    const view = activeView()
    if (!view) throw new Error('Open a page before capturing')
    return fn(view)
  }

  const save = async (
    view: WebContentsView,
    shot: Shot,
    kind: CaptureRecord['kind']
  ): Promise<CaptureRecord> => {
    const record = await addCapture(shot.png, {
      kind,
      ...meta(view),
      width: shot.width,
      height: shot.height
    })
    flash(view, `Saved to Captures · ${kind}`)
    return record
  }

  ipcMain.handle('capture:viewport', () =>
    withView(async (view) => save(view, await captureViewport(view), 'viewport'))
  )

  ipcMain.handle('capture:fullpage', () =>
    withView(async (view) => save(view, await captureFullPage(view), 'fullpage'))
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

/** Used by the extractor to grab just the selected element. */
export async function captureRect(rect: Rect): Promise<Buffer | null> {
  const view = activeView()
  if (!view) return null
  const shot = await captureViewport(view, rect)
  return shot.png
}

export { meta as pageMeta }

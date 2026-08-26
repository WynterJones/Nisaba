import { BrowserWindow, dialog, ipcMain } from 'electron'
import { copyFile, mkdir } from 'fs/promises'
import { extname, join } from 'path'
import { activeView } from './browser'
import { captureRect, pageMeta } from './capture'
import { libraryRoot, newId, writeImage, type Rect } from './library'

export type PinContext = {
  selector: string
  fallbacks: string[]
  tag: string
  rect: Rect
  text: string
  html: string
  styles: Record<string, string>
  classes: string[]
  elementId: string | null
  testId: string | null
  ariaLabel: string | null
  /** Nearest preceding heading and enclosing landmark, so a task reads like a location. */
  heading: string | null
  landmark: string | null
  viewport: { width: number; height: number }
  scroll: number
  /** Distinctive strings worth grepping the codebase for. */
  needles: { value: string; kind: 'testid' | 'id' | 'text' | 'class' | 'aria' }[]
}

/**
 * A persistent in-page overlay: hover to target, click to drop a numbered pin.
 * It survives between pins (unlike the one-shot extractor) and re-anchors on scroll.
 * The page still cannot call anything — main asks it for the next pin and gets data back.
 */
const INSTALL = `(() => {
  if (window.__nisabaAudit) { window.__nisabaAudit.resume(); return true }

  const NS = {}
  const state = { pins: [], waiters: [], stopped: false, hover: null, base: 0 }

  const layer = document.createElement('div')
  layer.id = '__nisaba_audit__'
  layer.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none'

  const outline = document.createElement('div')
  outline.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #a06bf0;background:rgba(121,40,219,.12);border-radius:3px;transition:all 60ms ease;display:none'

  const label = document.createElement('div')
  label.style.cssText = 'position:fixed;pointer-events:none;background:#7928db;color:#fff;font:600 11px/1.5 ui-monospace,monospace;padding:3px 7px;border-radius:5px;white-space:nowrap;display:none'

  const hint = document.createElement('div')
  hint.innerHTML = 'Audit · click anything to pin a note &nbsp;·&nbsp; <b>Esc</b> to finish'
  hint.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0d0d0f;color:#e6e6ea;border:1px solid #7928db;border-radius:9px;padding:8px 14px;font:500 13px system-ui;pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.5)'

  layer.append(outline, label, hint)
  document.documentElement.appendChild(layer)

  const isOurs = (el) => !el || layer.contains(el)

  /* ---- context collection ---- */

  function cssPath(el) {
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && parts.length < 8) {
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break }
      let sel = node.tagName.toLowerCase()
      const parent = node.parentElement
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName)
        if (same.length > 1) sel += ':nth-of-type(' + (same.indexOf(node) + 1) + ')'
      }
      parts.unshift(sel)
      node = node.parentElement
    }
    return parts.join(' > ')
  }

  function fallbacks(el) {
    const out = []
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy')
    if (testId) out.push('[data-testid="' + testId + '"]')
    if (el.id) out.push('#' + CSS.escape(el.id))
    const aria = el.getAttribute('aria-label')
    if (aria) out.push(el.tagName.toLowerCase() + '[aria-label="' + aria + '"]')
    const classes = (typeof el.className === 'string' ? el.className.trim().split(/\\s+/) : []).filter(Boolean)
    if (classes.length) out.push(el.tagName.toLowerCase() + '.' + classes.slice(0, 3).map((c) => CSS.escape(c)).join('.'))
    return out.slice(0, 4)
  }

  const STYLE_KEYS = ['display','position','width','height','padding','margin','gap','font-family','font-size','font-weight','line-height','letter-spacing','color','background-color','border','border-radius','box-shadow','text-align','overflow','z-index']

  function styles(el) {
    const cs = getComputedStyle(el)
    const out = {}
    for (const key of STYLE_KEYS) {
      const v = cs.getPropertyValue(key).trim()
      if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px') out[key] = v
    }
    return out
  }

  /** Direct text only — nested markup would otherwise repeat itself. */
  function ownText(el) {
    const direct = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(' ')
    return (direct || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 160)
  }

  function nearestHeading(el) {
    if (/^H[1-6]$/.test(el.tagName)) return null
    let node = el
    while (node) {
      let sib = node.previousElementSibling
      while (sib) {
        if (/^H[1-6]$/.test(sib.tagName)) return sib.textContent.trim().slice(0, 80)
        const inner = sib.querySelector && sib.querySelector('h1,h2,h3,h4')
        if (inner) return inner.textContent.trim().slice(0, 80)
        sib = sib.previousElementSibling
      }
      node = node.parentElement
    }
    const first = document.querySelector('h1')
    return first ? first.textContent.trim().slice(0, 80) : null
  }

  function landmark(el) {
    const found = el.closest('main, nav, header, footer, aside, section, article, form, [role]')
    if (!found) return null
    const role = found.getAttribute('role')
    const id = found.id ? '#' + found.id : ''
    return (role || found.tagName.toLowerCase()) + id
  }

  /* Tailwind-ish utilities are everywhere and make useless search terms. */
  const UTILITY = /^(?:[a-z]{1,3}|(?:sm|md|lg|xl|2xl|hover|focus|active|dark|group|peer):.*|(?:m|p|w|h|gap|text|bg|border|rounded|flex|grid|items|justify|space|font|leading|tracking|top|left|right|bottom|z|opacity|shadow|min|max|col|row|order|self|place|inset|translate|scale|rotate|duration|ease|transition|overflow|object|cursor|select|pointer|whitespace|truncate|sr|not)(?:-.*)?)$/

  function needles(el) {
    const out = []
    const push = (value, kind) => {
      if (value && String(value).trim().length > 2) out.push({ value: String(value).trim(), kind })
    }
    push(el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy'), 'testid')
    push(el.getAttribute('data-component') || el.getAttribute('data-name'), 'testid')
    push(el.id, 'id')
    push(el.getAttribute('aria-label'), 'aria')

    const text = ownText(el)
    // Distinctive enough to be worth grepping, short enough to survive formatting.
    if (text.length >= 4 && text.length <= 60 && !/^\\d+$/.test(text)) push(text, 'text')

    const classes = (typeof el.className === 'string' ? el.className.trim().split(/\\s+/) : []).filter(Boolean)
    for (const c of classes) {
      if (c.length >= 6 && !UTILITY.test(c) && !/\\d/.test(c.slice(0, 2))) push(c, 'class')
    }
    return out.slice(0, 6)
  }

  function collect(el) {
    const r = el.getBoundingClientRect()
    const clone = el.cloneNode(true)
    clone.querySelectorAll && clone.querySelectorAll('script,noscript,iframe').forEach((n) => n.remove())
    const html = clone.outerHTML || ''
    return {
      selector: cssPath(el),
      fallbacks: fallbacks(el),
      tag: el.tagName.toLowerCase(),
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      text: ownText(el),
      html: html.length > 4000 ? html.slice(0, 4000) + '\\n<!-- truncated -->' : html,
      styles: styles(el),
      classes: (typeof el.className === 'string' ? el.className.trim().split(/\\s+/) : []).filter(Boolean).slice(0, 12),
      elementId: el.id || null,
      testId: el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      heading: nearestHeading(el),
      landmark: landmark(el),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: window.scrollY,
      needles: needles(el)
    }
  }

  /* ---- markers ---- */

  function marker(pin) {
    const dot = document.createElement('div')
    dot.dataset.pin = pin.id
    dot.style.cssText = 'position:fixed;pointer-events:none;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#7928db;color:#fff;font:700 12px system-ui;box-shadow:0 2px 10px rgba(0,0,0,.5),0 0 0 2px rgba(255,255,255,.85)'
    dot.textContent = pin.index

    const box = document.createElement('div')
    box.dataset.pinBox = pin.id
    box.style.cssText = 'position:fixed;pointer-events:none;border:2px dashed rgba(160,107,240,.85);border-radius:3px'

    layer.append(box, dot)
    pin.dot = dot
    pin.box = box
  }

  function place() {
    for (const pin of state.pins) {
      const el = document.querySelector(pin.selector)
      if (!el) { pin.dot.style.display = 'none'; pin.box.style.display = 'none'; continue }
      const r = el.getBoundingClientRect()
      const off = r.bottom < 0 || r.top > window.innerHeight
      pin.dot.style.display = off ? 'none' : 'grid'
      pin.box.style.display = off ? 'none' : 'block'
      pin.box.style.left = r.left + 'px'
      pin.box.style.top = r.top + 'px'
      pin.box.style.width = r.width + 'px'
      pin.box.style.height = r.height + 'px'
      pin.dot.style.left = (r.left - 10) + 'px'
      pin.dot.style.top = (r.top - 10) + 'px'
    }
  }

  /* ---- interaction ---- */

  const onMove = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (isOurs(el) || !el) return
    state.hover = el
    const r = el.getBoundingClientRect()
    outline.style.display = 'block'
    outline.style.left = r.left + 'px'
    outline.style.top = r.top + 'px'
    outline.style.width = r.width + 'px'
    outline.style.height = r.height + 'px'
    label.style.display = 'block'
    label.textContent = el.tagName.toLowerCase() + '  ' + Math.round(r.width) + '×' + Math.round(r.height)
    label.style.left = Math.max(4, r.left) + 'px'
    label.style.top = (r.top > 26 ? r.top - 24 : r.bottom + 4) + 'px'
  }

  const onClick = (e) => {
    if (state.stopped) return
    e.preventDefault(); e.stopPropagation()
    const el = state.hover || document.elementFromPoint(e.clientX, e.clientY)
    if (!el || isOurs(el)) return
    const context = collect(el)
    const pin = { id: 'p' + Date.now() + Math.round(Math.random() * 999), index: state.base + state.pins.length + 1, selector: context.selector }
    state.pins.push(pin)
    marker(pin)
    place()
    const waiter = state.waiters.shift()
    const payload = { id: pin.id, index: pin.index, context }
    if (waiter) waiter(payload)
    else state.queue.push(payload)
  }

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); NS.stop() }
  }

  state.queue = []

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('scroll', place, true)
  window.addEventListener('resize', place, true)

  NS.next = () => new Promise((resolve) => {
    if (state.stopped) return resolve(null)
    if (state.queue.length) return resolve(state.queue.shift())
    state.waiters.push(resolve)
  })

  NS.remove = (id) => {
    const i = state.pins.findIndex((p) => p.id === id)
    if (i === -1) return false
    state.pins[i].dot.remove(); state.pins[i].box.remove()
    state.pins.splice(i, 1)
    state.pins.forEach((p, n) => { p.index = state.base + n + 1; p.dot.textContent = p.index })
    place()
    return true
  }

  NS.resume = () => { state.stopped = false; layer.style.display = 'block' }

  /** Numbers this page's dots from where a resumed audit left off. */
  NS.rebase = (n) => {
    state.base = n
    state.pins.forEach((p, i) => { p.index = n + i + 1; p.dot.textContent = p.index })
    return true
  }

  /** The pin screenshot must not contain Nisaba's own markers, so hide them for a frame. */
  NS.hide = () => new Promise((resolve) => {
    layer.style.visibility = 'hidden'
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
  })

  NS.show = () => { layer.style.visibility = 'visible'; return true }

  NS.stop = () => {
    state.stopped = true
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKey, true)
    window.removeEventListener('scroll', place, true)
    window.removeEventListener('resize', place, true)
    layer.remove()
    delete window.__nisabaAudit
    state.waiters.splice(0).forEach((w) => w(null))
  }

  window.__nisabaAudit = NS
  return true
})()`

export function registerAuditIpc(): void {
  const view = (): NonNullable<ReturnType<typeof activeView>> => {
    const found = activeView()
    if (!found) throw new Error('Open a page before auditing it')
    return found
  }

  ipcMain.handle('audit:start', async (_e, base: number = 0) => {
    const target = view()
    await target.webContents.executeJavaScript(INSTALL, true)
    await target.webContents
      .executeJavaScript(`window.__nisabaAudit.rebase(${Math.max(0, Math.trunc(base) || 0)})`, true)
      .catch(() => undefined)
    return pageMeta(target)
  })

  /** Resolves with the next pin the user drops, or null once they finish. */
  ipcMain.handle('audit:next', async () => {
    const target = view()
    const pin = (await target.webContents.executeJavaScript(
      'window.__nisabaAudit ? window.__nisabaAudit.next() : null',
      true
    )) as { id: string; index: number; context: PinContext } | null
    if (!pin) return null

    const run = (code: string): Promise<unknown> =>
      target.webContents.executeJavaScript(code, true).catch(() => undefined)

    await run('window.__nisabaAudit && window.__nisabaAudit.hide()')
    // The page has painted, but capturePage reads the compositor, which lags a frame or two.
    await new Promise((resolve) => setTimeout(resolve, 140))
    const png = await captureRect(pin.context.rect).catch(() => null)
    await run('window.__nisabaAudit && window.__nisabaAudit.show()')

    const shot = png ? await writeImage('audits', newId(), png) : null
    return { ...pin, shot }
  })

  ipcMain.handle('audit:remove', async (_e, id: string) =>
    view().webContents.executeJavaScript(
      `window.__nisabaAudit ? window.__nisabaAudit.remove(${JSON.stringify(id)}) : false`,
      true
    )
  )

  /**
   * A picture for a task that is not on the page — a mockup, a screenshot from somewhere else,
   * a photo of a whiteboard. Copied into the library rather than linked, so the audit still
   * exports after the original is moved. The bytes are left alone: whatever Chromium can show
   * in the panel it can also show in the exported plan.
   */
  ipcMain.handle('audit:attach', async (e): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Attach an image to this task',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }]
    })
    const picked = result.filePaths[0]
    if (result.canceled || !picked) return null

    const rel = `audits/${newId()}${extname(picked).toLowerCase() || '.png'}`
    await mkdir(join(libraryRoot(), 'audits'), { recursive: true })
    await copyFile(picked, join(libraryRoot(), rel))
    return rel
  })

  ipcMain.handle('audit:stop', async () => {
    const found = activeView()
    if (!found) return
    await found.webContents
      .executeJavaScript('window.__nisabaAudit && window.__nisabaAudit.stop()', true)
      .catch(() => undefined)
  })
}

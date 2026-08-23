import { ipcMain } from 'electron'
import { activeView } from './browser'
import { captureRect, pageMeta } from './capture'
import { addRecord, hashImage, newId, writeImage, type SectionRecord } from './library'

export type SectionDraft = Omit<SectionRecord, 'id' | 'file' | 'createdAt'> & {
  preview: string
  rect: { x: number; y: number; width: number; height: number }
}

/**
 * Runs inside the untrusted page. It can only ever return data — the page has no
 * preload bridge and cannot call back into the app.
 */
const SELECTOR_SCRIPT = `(() => new Promise((resolve) => {
  const OLD = document.getElementById('__nisaba_pick__')
  if (OLD) OLD.remove()

  const outline = document.createElement('div')
  outline.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #a06bf0;background:rgba(121,40,219,.14);box-shadow:0 0 0 1px rgba(0,0,0,.6);transition:all 60ms ease'

  const label = document.createElement('div')
  label.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:#7928db;color:#fff;font:600 11px/1.5 ui-monospace,monospace;padding:3px 7px;border-radius:5px;white-space:nowrap'

  const hint = document.createElement('div')
  hint.innerHTML = 'Click to select  ·  <b>↑</b> parent  <b>↓</b> child  <b>←→</b> siblings  ·  <b>Esc</b> cancel'
  hint.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#0d0d0f;color:#e6e6ea;border:1px solid #2a2a31;border-radius:9px;padding:8px 14px;font:500 13px system-ui;pointer-events:none'

  const host = document.createElement('div')
  host.id = '__nisaba_pick__'
  host.append(outline, label, hint)
  document.documentElement.appendChild(host)

  let current = null

  const isOurs = (el) => !el || host.contains(el)

  function paint(el) {
    if (!el || isOurs(el)) return
    current = el
    const r = el.getBoundingClientRect()
    outline.style.left = r.left + 'px'
    outline.style.top = r.top + 'px'
    outline.style.width = r.width + 'px'
    outline.style.height = r.height + 'px'
    const id = el.id ? '#' + el.id : ''
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : ''
    label.textContent = el.tagName.toLowerCase() + id + cls + '  ' + Math.round(r.width) + '×' + Math.round(r.height)
    const above = r.top > 26
    label.style.left = Math.max(4, r.left) + 'px'
    label.style.top = (above ? r.top - 24 : r.bottom + 4) + 'px'
  }

  /* ---- extraction helpers ---- */

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

  const STYLE_KEYS = [
    'display','position','flex-direction','justify-content','align-items','gap',
    'grid-template-columns','grid-template-rows','width','max-width','height','padding','margin',
    'font-family','font-size','font-weight','line-height','letter-spacing','text-align','text-transform',
    'color','background-color','background-image','border','border-radius','box-shadow','opacity',
    'overflow','z-index','transition','transform'
  ]

  function styles(el) {
    const cs = getComputedStyle(el)
    const out = {}
    for (const key of STYLE_KEYS) {
      const value = cs.getPropertyValue(key).trim()
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto') out[key] = value
    }
    return out
  }

  function variables() {
    const out = {}
    for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch { continue } // cross-origin stylesheet
      if (!rules) continue
      for (const rule of rules) {
        if (!rule.style || !rule.selectorText) continue
        if (!/^:root|^html|^\\[data-theme/.test(rule.selectorText)) continue
        for (const prop of rule.style) {
          if (prop.startsWith('--')) out[prop] = rule.style.getPropertyValue(prop).trim()
        }
      }
      if (Object.keys(out).length > 120) break
    }
    return out
  }

  function walk(el, fn) {
    fn(el)
    const kids = el.querySelectorAll('*')
    for (let i = 0; i < kids.length && i < 400; i++) fn(kids[i])
  }

  function palette(el) {
    const colors = new Map(), fonts = new Set()
    walk(el, (node) => {
      const cs = getComputedStyle(node)
      fonts.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim())
      for (const key of ['color', 'backgroundColor', 'borderTopColor']) {
        const v = cs[key]
        if (v && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(v)) colors.set(v, (colors.get(v) || 0) + 1)
      }
    })
    const top = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map((e) => e[0])
    return { colors: top, fonts: [...fonts].filter(Boolean).slice(0, 6) }
  }

  function assets(el) {
    const urls = new Set()
    walk(el, (node) => {
      if (node.tagName === 'IMG' && node.currentSrc) urls.add(node.currentSrc)
      if (node.tagName === 'SOURCE' && node.srcset) urls.add(node.srcset.split(' ')[0])
      const bg = getComputedStyle(node).backgroundImage
      const m = bg && bg.match(/url\\(["']?([^"')]+)/)
      if (m) urls.add(m[1])
      if (node.tagName === 'svg' || node.tagName === 'SVG') urls.add('inline-svg')
    })
    return [...urls].slice(0, 40)
  }

  /** Scripts, handlers, entered values and tracking ids never leave the page. */
  function sanitized(el) {
    const clone = el.cloneNode(true)
    clone.querySelectorAll('script,noscript,iframe,object,embed').forEach((n) => n.remove())
    const scrub = (node) => {
      for (const attr of [...node.attributes]) {
        if (/^on/i.test(attr.name) || /^(nonce|integrity)$/i.test(attr.name)) node.removeAttribute(attr.name)
      }
      if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
        node.removeAttribute('value')
        node.value = ''
      }
      node.querySelectorAll && node.querySelectorAll('*').forEach(() => {})
    }
    scrub(clone)
    clone.querySelectorAll('*').forEach(scrub)
    const html = clone.outerHTML
    return html.length > 60000 ? html.slice(0, 60000) + '\\n<!-- truncated -->' : html
  }

  function a11y(el) {
    const headings = [...el.querySelectorAll('h1,h2,h3,h4')].slice(0, 8)
      .map((h) => h.tagName.toLowerCase() + ': ' + h.textContent.trim().slice(0, 60))
    return {
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 80),
      headings
    }
  }

  function tech() {
    const found = []
    const add = (name, confidence, evidence) => found.push({ name, confidence, evidence })
    const html = document.documentElement.outerHTML.slice(0, 200000)

    if (window.__NEXT_DATA__ || document.getElementById('__next') || /\\/_next\\//.test(html))
      add('Next.js', 0.9, 'Found /_next/ assets or the __NEXT_DATA__ payload')
    if (window.__NUXT__) add('Nuxt', 0.9, 'window.__NUXT__ is defined')
    if (document.querySelector('[data-reactroot]') || Object.keys(document.body).some((k) => k.startsWith('__react')))
      add('React', 0.85, 'React roots or internal props on the DOM')
    if (window.Vue || document.querySelector('[data-v-app],[data-v-]')) add('Vue', 0.7, 'Vue scope attributes present')
    if (document.querySelector('[class*="svelte-"]')) add('Svelte', 0.7, 'svelte- scoped class names')
    if (/\\b(flex|grid|hidden)\\b.*\\b(px-\\d|py-\\d|text-\\w+-\\d{3})\\b/.test(html) || /tailwind/i.test(html))
      add('Tailwind CSS', 0.75, 'Utility class patterns in the markup')
    if (document.querySelector('[class^="MuiBox"],[class*="MuiButton"]')) add('MUI', 0.8, 'Mui* class names')
    if (document.querySelector('.btn.btn-primary,[class*="col-md-"]')) add('Bootstrap', 0.6, 'Bootstrap grid or button classes')
    if (window.jQuery) add('jQuery', 0.95, 'window.jQuery is defined')
    if (window.dataLayer || /googletagmanager/.test(html)) add('Google Tag Manager', 0.8, 'dataLayer or GTM script')
    if (/lucide/i.test(html)) add('Lucide icons', 0.6, 'lucide references in the markup')
    if (document.querySelector('.fa,[class^="fa-"]')) add('Font Awesome', 0.7, 'fa- icon classes')
    if (/fonts\\.googleapis\\.com/.test(html)) add('Google Fonts', 0.9, 'Google Fonts stylesheet link')
    return found.slice(0, 8)
  }

  function collect(el) {
    const r = el.getBoundingClientRect()
    const p = palette(el)
    return {
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      html: sanitized(el),
      styles: styles(el),
      variables: variables(),
      fonts: p.fonts,
      colors: p.colors,
      assets: assets(el),
      a11y: a11y(el),
      tech: tech()
    }
  }

  /* ---- interaction ---- */

  const finish = (value) => {
    host.remove()
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKey, true)
    resolve(value)
  }

  const onMove = (e) => paint(document.elementFromPoint(e.clientX, e.clientY))

  const onClick = (e) => {
    e.preventDefault(); e.stopPropagation()
    if (current) finish(collect(current))
  }

  const onKey = (e) => {
    if (!current) return
    const map = {
      Escape: () => finish(null),
      Enter: () => finish(collect(current)),
      ArrowUp: () => current.parentElement && paint(current.parentElement),
      ArrowDown: () => current.firstElementChild && paint(current.firstElementChild),
      ArrowLeft: () => current.previousElementSibling && paint(current.previousElementSibling),
      ArrowRight: () => current.nextElementSibling && paint(current.nextElementSibling)
    }
    if (map[e.key]) { e.preventDefault(); e.stopPropagation(); map[e.key]() }
  }

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKey, true)
}))()`

const CANCEL_SCRIPT = `(() => {
  const host = document.getElementById('__nisaba_pick__') || document.getElementById('__nisaba_region__')
  if (host) { host.remove(); return true }
  return false
})()`

export function registerExtractIpc(): void {
  ipcMain.handle('extract:select', async (): Promise<SectionDraft | null> => {
    const view = activeView()
    if (!view) throw new Error('Open a page before extracting')

    const picked = (await view.webContents.executeJavaScript(SELECTOR_SCRIPT, true)) as Omit<
      SectionDraft,
      'preview' | 'url' | 'title' | 'host' | 'name'
    > | null
    if (!picked) return null

    const png = await captureRect(picked.rect)
    const page = pageMeta(view)

    return {
      ...picked,
      ...page,
      name: `${page.host} — ${picked.tag}`,
      preview: png ? `data:image/png;base64,${png.toString('base64')}` : ''
    }
  })

  ipcMain.handle('extract:cancel', async () => {
    const view = activeView()
    if (view) await view.webContents.executeJavaScript(CANCEL_SCRIPT, true)
  })

  ipcMain.handle('extract:save', async (_e, draft: SectionDraft) => {
    const png = await captureRect(draft.rect)
    if (!png) throw new Error('Could not capture the selection')
    const { preview: _preview, ...record } = draft
    const id = newId()
    return addRecord('sections', {
      ...record,
      id,
      createdAt: Date.now(),
      file: await writeImage('sections', id, png),
      phash: await hashImage(png)
    })
  })
}

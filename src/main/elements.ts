import { ipcMain, type WebContentsView } from 'electron'
import { activeView } from './browser'
import { captureRect, pageMeta } from './capture'
import { addRecord, hashImage, newId, writeImage, type ElementRecord, type Rect } from './library'

export type ElementCandidate = {
  key: string
  category: string
  label: string
  selector: string
  rect: Rect
  styles: Record<string, string>
  text: string
  /** Pseudo-class states this element actually declares rules for. */
  states: string[]
}

/** Finds the recurring UI primitives on a page and reports where they are. */
const DETECT_SCRIPT = `(() => {
  const CATEGORIES = [
    { category: 'Button', match: 'button, a[role="button"], input[type="submit"], input[type="button"], [class*="btn"]' },
    { category: 'Input', match: 'input[type="text"], input[type="email"], input[type="search"], input[type="password"], input:not([type]), textarea' },
    { category: 'Select', match: 'select, [role="combobox"], [role="listbox"]' },
    { category: 'Checkbox', match: 'input[type="checkbox"], [role="checkbox"], [role="switch"]' },
    { category: 'Radio', match: 'input[type="radio"], [role="radio"]' },
    { category: 'Badge', match: '[class*="badge"], [class*="chip"], [class*="tag"]:not(a)' },
    { category: 'Card', match: '[class*="card"], article' },
    { category: 'Alert', match: '[role="alert"], [class*="alert"], [class*="banner"], [class*="toast"]' },
    { category: 'Navigation', match: 'nav, [role="navigation"]' },
    { category: 'Table', match: 'table, [role="table"]' }
  ]

  const KEYS = [
    'display','padding','margin','width','height','min-height','font-family','font-size','font-weight',
    'line-height','letter-spacing','text-transform','color','background-color','background-image',
    'border','border-radius','box-shadow','opacity','gap','transition','cursor'
  ]

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

  function styles(el) {
    const cs = getComputedStyle(el)
    const out = {}
    for (const key of KEYS) {
      const v = cs.getPropertyValue(key).trim()
      if (v && v !== 'none' && v !== 'normal' && v !== 'auto') out[key] = v
    }
    return out
  }

  /** Which pseudo-classes this page has actual rules for — not guesses. */
  function declaredStates(el) {
    const found = new Set()
    const classes = typeof el.className === 'string' ? el.className.trim().split(/\\s+/) : []
    const tag = el.tagName.toLowerCase()
    for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch { continue }
      if (!rules) continue
      for (const rule of rules) {
        const sel = rule.selectorText
        if (!sel) continue
        const m = sel.match(/:(hover|focus|focus-visible|active|disabled|checked|open)\\b/g)
        if (!m) continue
        const targetsUs =
          sel.includes(tag) || classes.some((c) => c && sel.includes('.' + c))
        if (targetsUs) m.forEach((s) => found.add(s.slice(1)))
      }
      if (found.size >= 5) break
    }
    if (el.disabled !== undefined) found.add('disabled')
    return [...found].slice(0, 5)
  }

  /** Nested markup repeats its text; take the deepest single run instead of the concatenation. */
  function label(el) {
    const direct = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .filter(Boolean)
      .join(' ')
    const raw =
      direct ||
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      (el.textContent || '').trim().split(/\\s{2,}|\\n/)[0] ||
      ''
    return raw.trim().replace(/\\s+/g, ' ').slice(0, 40)
  }

  const seen = new Set()
  const out = []

  for (const { category, match } of CATEGORIES) {
    let els
    try { els = [...document.querySelectorAll(match)] } catch { continue }
    let taken = 0
    for (const el of els) {
      if (taken >= 6) break
      const r = el.getBoundingClientRect()
      if (r.width < 16 || r.height < 12 || r.width > 1400 || r.height > 700) continue
      if (r.bottom < 0 || r.top > window.innerHeight) continue

      const s = styles(el)
      // Collapse visually identical instances so a matrix shows variants, not repeats.
      const fingerprint = category + '|' + s['background-color'] + s['border-radius'] + s['font-size'] + s['border'] + s['color']
      if (seen.has(fingerprint)) continue
      seen.add(fingerprint)
      taken++

      out.push({
        key: fingerprint,
        category,
        label: label(el) || category,
        selector: cssPath(el),
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
        styles: s,
        text: (el.textContent || '').trim().slice(0, 80),
        states: declaredStates(el)
      })
    }
  }
  return out
})()`

/** Applies a pseudo-class to one element via CDP so its real state styles render. */
async function forceState(
  view: WebContentsView,
  selector: string,
  state: string
): Promise<Record<string, string> | null> {
  const wc = view.webContents
  const attachedHere = !wc.debugger.isAttached()
  if (attachedHere) wc.debugger.attach('1.3')
  try {
    await wc.debugger.sendCommand('DOM.enable')
    await wc.debugger.sendCommand('CSS.enable')
    const { root } = (await wc.debugger.sendCommand('DOM.getDocument')) as {
      root: { nodeId: number }
    }
    const { nodeId } = (await wc.debugger.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector
    })) as { nodeId: number }
    if (!nodeId) return null

    await wc.debugger.sendCommand('CSS.forcePseudoState', {
      nodeId,
      forcedPseudoClasses: [state]
    })
    // Let the compositor paint the state before the caller screenshots it.
    await new Promise((resolve) => setTimeout(resolve, 120))
    return {}
  } catch {
    return null
  } finally {
    if (attachedHere && wc.debugger.isAttached()) {
      try {
        wc.debugger.detach()
      } catch {
        /* already gone */
      }
    }
  }
}

async function clearState(view: WebContentsView, selector: string): Promise<void> {
  await forceState(view, selector, '')
}

export function registerElementIpc(): void {
  ipcMain.handle('elements:detect', async (): Promise<ElementCandidate[]> => {
    const view = activeView()
    if (!view) throw new Error('Open a page before detecting elements')
    return view.webContents.executeJavaScript(DETECT_SCRIPT, true) as Promise<ElementCandidate[]>
  })

  ipcMain.handle(
    'elements:save',
    async (_e, candidates: ElementCandidate[]): Promise<ElementRecord[]> => {
      const view = activeView()
      if (!view) throw new Error('Open a page before saving elements')
      const page = pageMeta(view)
      const saved: ElementRecord[] = []

      for (const candidate of candidates) {
        const png = await captureRect(candidate.rect)
        if (!png) continue
        const id = newId()

        // Screenshot each declared interaction state as its own frame.
        const states: ElementRecord['states'] = []
        for (const state of candidate.states.filter((s) => s !== 'disabled')) {
          const applied = await forceState(view, candidate.selector, state)
          if (!applied) continue
          const shot = await captureRect(candidate.rect).catch(() => null)
          await clearState(view, candidate.selector)
          if (shot) {
            states.push({
              state,
              file: await writeImage('elements', `${id}-${state}`, shot),
              styles: {}
            })
          }
        }

        saved.push(
          await addRecord('elements', {
            id,
            createdAt: Date.now(),
            category: candidate.category,
            label: candidate.label,
            host: page.host,
            url: page.url,
            selector: candidate.selector,
            file: await writeImage('elements', id, png),
            phash: await hashImage(png),
            rect: candidate.rect,
            states,
            styles: candidate.styles,
            text: candidate.text
          })
        )
      }

      return saved
    }
  )
}

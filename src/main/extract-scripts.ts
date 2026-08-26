/**
 * Every string in this file is JavaScript that runs inside an untrusted remote page. It lives
 * apart from the IPC wiring so it can be parsed by `npm run check:extract` — a typo in an
 * embedded script is otherwise invisible until someone clicks the button.
 */

/**
 * The measuring half of the extractor, shared by the element picker and the whole-page
 * capture. Runs inside the untrusted page: it can only ever return data, because the page
 * has no preload bridge and cannot call back into the app.
 *
 * `LIMIT` is spliced in by the caller — a whole page needs a far bigger budget than a section.
 */
export const HELPERS = `
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
    return parts.join(' > ') || 'body'
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
    for (let i = 0; i < kids.length && i < LIMIT.nodes; i++) fn(kids[i])
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
    return [...urls].slice(0, LIMIT.assets)
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
    }
    scrub(clone)
    clone.querySelectorAll('*').forEach(scrub)
    const html = clone.outerHTML
    return html.length > LIMIT.html ? html.slice(0, LIMIT.html) + '\\n<!-- truncated -->' : html
  }

  function a11y(el) {
    const headings = [...el.querySelectorAll('h1,h2,h3,h4')].slice(0, LIMIT.headings)
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
`

export const SECTION_LIMIT = `const LIMIT = { nodes: 400, assets: 40, html: 60000, headings: 8 }`
/** A whole page is an order of magnitude more markup, and the outline matters far more. */
export const PAGE_LIMIT = `const LIMIT = { nodes: 4000, assets: 120, html: 400000, headings: 40 }`

/**
 * What "an element" means when picking one. Hovering a page hits whatever leaf is under the
 * cursor — nearly always a `<span>` inside the button or the layout `<div>` wrapping it — so
 * element mode climbs to the nearest of these instead of highlighting the raw hit target.
 */
export const PICKABLE = [
  'button', 'a[href]', 'input', 'textarea', 'select', 'label', 'summary',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote', 'li',
  'img', 'picture', 'video', 'svg', 'table', 'form', 'fieldset',
  '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="switch"]', '[role="radio"]',
  '[role="tab"]', '[role="menuitem"]', '[role="combobox"]', '[role="listbox"]',
  '[class*="btn"]', '[class*="button"]', '[class*="badge"]', '[class*="chip"]',
  '[class*="card"]', '[class*="input"]', '[class*="avatar"]', '[class*="tag"]'
].join(',')

/**
 * The click-to-pick overlay. `section` mode highlights whatever is under the cursor, because a
 * section is usually a wrapper. `element` mode only ever highlights a real control — a button,
 * a heading, an input — and refuses to select the anonymous divs in between.
 */
export function selectorScript(mode: 'section' | 'element'): string {
  const elementMode = mode === 'element'
  return `(() => new Promise((resolve) => {
  ${SECTION_LIMIT}
  ${HELPERS}
  const ELEMENT_MODE = ${elementMode}
  const PICKABLE = ${JSON.stringify(PICKABLE)}
  const OLD = document.getElementById('__nisaba_pick__')
  if (OLD) OLD.remove()

  const outline = document.createElement('div')
  outline.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #a06bf0;background:rgba(121,40,219,.14);box-shadow:0 0 0 1px rgba(0,0,0,.6);transition:all 60ms ease'

  const label = document.createElement('div')
  label.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:#7928db;color:#fff;font:600 11px/1.5 ui-monospace,monospace;padding:3px 7px;border-radius:5px;white-space:nowrap'

  const hint = document.createElement('div')
  hint.innerHTML = ELEMENT_MODE
    ? 'Hover a button, heading, input or image  ·  <b>↑</b> wider  <b>↓</b> narrower  <b>←→</b> next  ·  <b>Esc</b> cancel'
    : 'Click to select  ·  <b>↑</b> parent  <b>↓</b> child  <b>←→</b> siblings  ·  <b>Esc</b> cancel'
  hint.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#0d0d0f;color:#e6e6ea;border:1px solid #2a2a31;border-radius:9px;padding:8px 14px;font:500 13px system-ui;pointer-events:none'

  const host = document.createElement('div')
  host.id = '__nisaba_pick__'
  host.append(outline, label, hint)
  document.documentElement.appendChild(host)

  let current = null

  const isOurs = (el) => !el || host.contains(el)

  /** Big enough to be worth a screenshot — a 0×0 wrapper is not the thing the user aimed at. */
  const solid = (el) => {
    const r = el.getBoundingClientRect()
    return r.width >= 8 && r.height >= 8
  }

  const matches = (el) => {
    if (!el || el.nodeType !== 1 || isOurs(el)) return false
    try { return el.matches(PICKABLE) && solid(el) } catch { return false }
  }

  /** In element mode a hit on a nested span resolves to the control that owns it. */
  function resolve_(el) {
    if (!ELEMENT_MODE) return isOurs(el) ? null : el
    let node = el
    for (let i = 0; node && node.nodeType === 1 && i < 10; i++) {
      if (matches(node)) return node
      node = node.parentElement
    }
    return null
  }

  function paint(el) {
    if (!el) {
      current = null
      outline.style.opacity = '0'
      label.style.opacity = '0'
      return
    }
    current = el
    outline.style.opacity = '1'
    label.style.opacity = '1'
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

  /* ---- movement ---- */

  const step = (from, dir) => {
    if (!ELEMENT_MODE) return dir(from)
    // Element mode only ever lands on something pickable, so keep walking until it does.
    let node = dir(from)
    for (let i = 0; node && i < 200; i++) {
      if (matches(node)) return node
      node = dir(node)
    }
    return null
  }

  const wider = (el) => {
    let node = el.parentElement
    if (!ELEMENT_MODE) return node
    while (node && !matches(node)) node = node.parentElement
    return node
  }

  const narrower = (el) => {
    if (!ELEMENT_MODE) return el.firstElementChild
    return [...el.querySelectorAll(PICKABLE)].find((c) => matches(c)) || null
  }

  /* ---- interaction ---- */

  const finish = (value) => {
    host.remove()
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKey, true)
    resolve(value)
  }

  const onMove = (e) => paint(resolve_(document.elementFromPoint(e.clientX, e.clientY)))

  const onClick = (e) => {
    e.preventDefault(); e.stopPropagation()
    if (current) finish(collect(current))
  }

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return finish(null) }
    if (!current) return
    const map = {
      Enter: () => finish(collect(current)),
      ArrowUp: () => { const n = wider(current); if (n) paint(n) },
      ArrowDown: () => { const n = narrower(current); if (n) paint(n) },
      ArrowLeft: () => { const n = step(current, (x) => x.previousElementSibling); if (n) paint(n) },
      ArrowRight: () => { const n = step(current, (x) => x.nextElementSibling); if (n) paint(n) }
    }
    if (map[e.key]) { e.preventDefault(); e.stopPropagation(); map[e.key]() }
  }

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKey, true)
}))()`
}

export const SELECTOR_SCRIPT = selectorScript('section')
export const ELEMENT_SCRIPT = selectorScript('element')

/**
 * The whole document as one extraction. Scroll position is irrelevant — `collect` measures
 * the element, and the screenshot is taken beyond the viewport by the capture module.
 */
export const PAGE_SCRIPT = `(() => {
  ${PAGE_LIMIT}
  ${HELPERS}
  const picked = collect(document.body)
  // Section outlines: the top-level blocks an agent should rebuild in order.
  picked.outline = [...document.body.children]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.height > 40 && r.width > 100
    })
    .slice(0, 40)
    .map((el, i) => {
      const r = el.getBoundingClientRect()
      const heading = el.querySelector('h1,h2,h3')
      return {
        index: i + 1,
        tag: el.tagName.toLowerCase(),
        selector: cssPath(el),
        heading: heading ? heading.textContent.trim().slice(0, 70) : '',
        height: Math.round(r.height)
      }
    })
  picked.pageTitle = document.title
  return picked
})()`

export const CANCEL_SCRIPT = `(() => {
  const host = document.getElementById('__nisaba_pick__') || document.getElementById('__nisaba_region__')
  if (host) { host.remove(); return true }
  return false
})()`

/**
 * The markup and matching rules for one element, as something a person can read: indented
 * HTML with the framework bookkeeping stripped, plus the page's own CSS rules that actually
 * apply to it. Computed styles say what an element *looks* like; this says how it was built,
 * which is what you need to rebuild it.
 */
export function markupScript(selector: string): string {
  return `(() => {
  const LIMIT = { nodes: 300, html: 24000, css: 24000 }
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return null

  /* ---- markup ---- */

  // Framework bookkeeping, tracking hooks and anything executable. Nothing here survives a
  // copy-paste into another project, and every one of them makes the markup harder to read.
  const DROP = /^(on[a-z]+|nonce|integrity|ping|srcset|sizes|loading|decoding|fetchpriority|data-v-[0-9a-f]+|data-react\\w*|data-svelte\\w*|data-testid|data-gtm\\w*|jsaction|jsname|jscontroller|aria-owns)$/i
  const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'])

  const clone = el.cloneNode(true)
  clone.querySelectorAll('script,noscript,iframe,object,embed,template,style,link').forEach((n) => n.remove())

  const scrub = (node) => {
    for (const attr of [...node.attributes]) {
      const empty = attr.value === '' && /^(class|style|id|alt|title)$/i.test(attr.name)
      if (DROP.test(attr.name) || empty) node.removeAttribute(attr.name)
    }
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
      node.removeAttribute('value')
      node.value = ''
    }
  }
  scrub(clone)
  clone.querySelectorAll('*').forEach(scrub)
  // Comments are page bookkeeping too — hydration markers, ad slots, build stamps.
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT)
  const comments = []
  while (walker.nextNode()) comments.push(walker.currentNode)
  comments.forEach((c) => c.remove())

  let printed = 0

  function attrs(node) {
    return [...node.attributes]
      .map((a) => (a.value === '' ? ' ' + a.name : ' ' + a.name + '="' + a.value.replace(/"/g, '&quot;') + '"'))
      .join('')
  }

  function print(node, depth) {
    if (printed > LIMIT.nodes) return ''
    const pad = '  '.repeat(depth)
    if (node.nodeType === 3) {
      const text = node.textContent.replace(/\\s+/g, ' ').trim()
      return text ? pad + text + '\\n' : ''
    }
    if (node.nodeType !== 1) return ''
    printed++
    const tag = node.tagName.toLowerCase()
    // An icon's path data is noise at every indent level; keep it exact but on one line.
    if (tag === 'svg') return pad + node.outerHTML.replace(/\\s*\\n\\s*/g, ' ') + '\\n'
    if (VOID.has(tag)) return pad + '<' + tag + attrs(node) + '>\\n'
    const kids = [...node.childNodes]
    if (!kids.some((k) => k.nodeType === 1)) {
      const text = node.textContent.replace(/\\s+/g, ' ').trim()
      return pad + '<' + tag + attrs(node) + '>' + text + '</' + tag + '>\\n'
    }
    let out = pad + '<' + tag + attrs(node) + '>\\n'
    for (const kid of kids) out += print(kid, depth + 1)
    return out + pad + '</' + tag + '>\\n'
  }

  let html = print(clone, 0).trimEnd()
  if (html.length > LIMIT.html) html = html.slice(0, LIMIT.html) + '\\n<!-- truncated -->'

  /* ---- the rules that reach it ---- */

  const nodes = [el, ...el.querySelectorAll('*')].slice(0, LIMIT.nodes)
  const seen = new Set()
  const hits = []

  // A rule counts when any node in the subtree matches it with its pseudo-classes stripped —
  // that is what keeps :hover and ::before in the output instead of silently dropping them.
  function reaches(sel) {
    const probe = sel.replace(/::?[a-z-]+(\\([^)]*\\))?/g, '').trim()
    if (!probe) return false
    try {
      return nodes.some((n) => n.matches(probe))
    } catch {
      return false
    }
  }

  function consider(rule, wrap) {
    if (hits.length > 200) return
    if (rule.selectorText && rule.style) {
      if (!rule.selectorText.split(',').some(reaches)) return
      const text = wrap ? wrap(rule.cssText) : rule.cssText
      if (seen.has(text)) return
      seen.add(text)
      hits.push(text)
      return
    }
    // Media queries carry the responsive half of the design; keep them, condition and all.
    if (rule.media && rule.cssRules) {
      const condition = rule.media.mediaText
      for (const inner of rule.cssRules) {
        consider(inner, (t) => '@media ' + condition + ' {\\n  ' + t + '\\n}')
      }
    }
  }

  const vars = {}
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue } // cross-origin stylesheet
    if (!rules) continue
    for (const rule of rules) {
      if (rule.style && rule.selectorText && /^(:root|html|\\[data-theme)/.test(rule.selectorText)) {
        for (const prop of rule.style) {
          if (prop.startsWith('--')) vars[prop] = rule.style.getPropertyValue(prop).trim()
        }
      }
      consider(rule, null)
    }
  }

  let css = hits.join('\\n\\n')

  // Only the custom properties the kept rules actually reference, resolved a few levels deep
  // so a token defined in terms of another token still renders.
  const used = {}
  for (let pass = 0; pass < 4; pass++) {
    const before = Object.keys(used).length
    const body = css + Object.values(used).join(';')
    for (const [name, value] of Object.entries(vars)) {
      if (!used[name] && body.includes('var(' + name)) used[name] = value
    }
    if (Object.keys(used).length === before) break
  }
  const names = Object.keys(used)
  if (names.length) {
    css = ':root {\\n' + names.map((n) => '  ' + n + ': ' + used[n] + ';').join('\\n') + '\\n}\\n\\n' + css
  }
  if (css.length > LIMIT.css) css = css.slice(0, LIMIT.css) + '\\n/* truncated */'

  return { html, css }
})()`
}

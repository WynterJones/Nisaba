/**
 * The page profiler, kept apart from the IPC wiring so `npm run check:extract` can parse it.
 * This string is evaluated inside an untrusted remote page and can only return data.
 */

/**
 * Walks the rendered page and counts what it actually uses, then samples the real controls —
 * buttons, inputs, selects, cards — so the profile is built from components rather than from
 * a frequency table alone. Everything here is *observed*; the inference (which button is
 * "primary", which radii form a scale) happens below in Node so the page never decides how
 * its own design gets labelled.
 */
export const PROFILE_SCRIPT = `(() => {
  const nodes = [...document.querySelectorAll('body *')].slice(0, 4000)
  const bump = (map, key) => { if (key) map[key] = (map[key] || 0) + 1 }
  const TRANSPARENT = /rgba\\(0, 0, 0, 0\\)|^transparent$/

  const colors = {}, backgrounds = {}, families = {}, weights = {}, sizes = {}
  const spacing = {}, radii = {}, shadows = {}, borderColors = {}
  // Weighted by how much text is actually set at each size — that is what "body" means.
  const textSizes = {}

  for (const el of nodes) {
    const cs = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue

    if (el.textContent && el.textContent.trim().length > 0) bump(colors, cs.color)
    // Only leaf-ish text counts, or every wrapper inherits and skews the histogram.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ')
    if (own.length > 12) textSizes[cs.fontSize] = (textSizes[cs.fontSize] || 0) + own.length
    if (cs.backgroundColor && !TRANSPARENT.test(cs.backgroundColor)) bump(backgrounds, cs.backgroundColor)
    if (cs.borderTopWidth !== '0px' && !TRANSPARENT.test(cs.borderTopColor)) bump(borderColors, cs.borderTopColor)

    bump(families, cs.fontFamily.split(',')[0].replace(/["']/g, '').trim())
    bump(weights, cs.fontWeight)
    bump(sizes, cs.fontSize)

    for (const key of ['paddingTop', 'paddingLeft', 'marginBottom', 'gap', 'rowGap']) {
      const v = cs[key]
      // Negative margins are layout hacks, not scale steps.
      if (v && v !== '0px' && v !== 'normal' && parseFloat(v) > 0 && parseFloat(v) < 200) bump(spacing, v)
    }
    if (cs.borderRadius && cs.borderRadius !== '0px') bump(radii, cs.borderTopLeftRadius)
    if (cs.boxShadow && cs.boxShadow !== 'none') bump(shadows, cs.boxShadow)
  }

  // The colour behind everything — walk up until something actually paints.
  let surface = 'rgb(255, 255, 255)'
  for (let el = document.body; el; el = el.parentElement) {
    const bg = getComputedStyle(el).backgroundColor
    if (bg && !TRANSPARENT.test(bg)) { surface = bg; break }
  }

  const shot = (el) => {
    const cs = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    return {
      background: TRANSPARENT.test(cs.backgroundColor) ? '' : cs.backgroundColor,
      color: cs.color,
      borderColor: cs.borderTopWidth === '0px' || TRANSPARENT.test(cs.borderTopColor) ? '' : cs.borderTopColor,
      borderWidth: cs.borderTopWidth,
      radius: cs.borderTopLeftRadius,
      padding: cs.paddingTop + ' ' + cs.paddingRight,
      height: Math.round(rect.height) + 'px',
      width: Math.round(rect.width),
      shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow,
      fontFamily: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      text: (el.textContent || '').trim().slice(0, 24)
    }
  }

  const visible = (el, minH, maxH) => {
    const rect = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return rect.height >= minH && rect.height <= maxH && rect.width > 24 &&
      cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.1
  }

  const pick = (selector, minH, maxH, limit) =>
    [...document.querySelectorAll(selector)]
      .filter((el) => visible(el, minH, maxH))
      .slice(0, limit)
      .map(shot)

  const buttons = pick(
    'button, [role="button"], input[type="submit"], input[type="button"], a[class*="btn"], a[class*="Btn"], a[class*="button"], a[class*="Button"]',
    24, 90, 40
  )
  const inputs = pick(
    'input[type="text"], input[type="email"], input[type="search"], input[type="password"], input[type="tel"], input[type="url"], input:not([type]), textarea',
    24, 200, 12
  )
  const selects = pick('select', 20, 90, 8)

  // Card-ish: a container that separates itself from the page with a radius plus either a
  // shadow or a border, and is big enough to hold content rather than being a chip.
  const cards = nodes
    .filter((el) => {
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      const area = rect.width * rect.height
      if (area < 12000 || area > 500000 || rect.height < 80) return false
      if (parseFloat(cs.borderRadius) <= 0) return false
      const separated = cs.boxShadow !== 'none' || (cs.borderTopWidth !== '0px' && !TRANSPARENT.test(cs.borderTopColor))
      return separated && el.children.length > 0
    })
    .slice(0, 12)
    .map(shot)

  // Custom properties declared on the document root, plus any @media widths in first-party CSS.
  const variables = {}
  const breakpoints = new Set()
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    if (!rules) continue
    for (const rule of rules) {
      if (rule.media) {
        const m = String(rule.conditionText || rule.media.mediaText).match(/(min|max)-width:\\s*([\\d.]+(px|rem|em))/g)
        if (m) m.forEach((x) => breakpoints.add(x.replace(/\\s+/g, ' ')))
      }
      if (rule.style && rule.selectorText && /^:root|^html/.test(rule.selectorText)) {
        for (const prop of rule.style) {
          if (prop.startsWith('--')) variables[prop] = rule.style.getPropertyValue(prop).trim()
        }
      }
    }
  }

  const typeScale = []
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'p', 'a', 'button', 'small']) {
    const el = document.querySelector(tag)
    if (!el) continue
    const cs = getComputedStyle(el)
    typeScale.push({
      tag,
      size: cs.fontSize,
      weight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
    })
  }

  const heading = document.querySelector('h1, h2, h3')

  return {
    colors, backgrounds, families, weights, sizes, textSizes, spacing, radii, shadows, borderColors,
    variables, breakpoints: [...breakpoints].slice(0, 12), typeScale,
    surface, buttons, inputs, selects, cards,
    // Full stacks, not just the first family: the generic keyword at the end tells us whether
    // the page wanted a serif, and that decides which Google font can stand in for it.
    bodyStack: getComputedStyle(document.body).fontFamily,
    headingStack: heading ? getComputedStyle(heading).fontFamily : getComputedStyle(document.body).fontFamily,
    title: document.title,
    description: (document.querySelector('meta[name="description"]') || {}).content || ''
  }
})()`

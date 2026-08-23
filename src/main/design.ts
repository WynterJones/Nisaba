import { ipcMain } from 'electron'
import { activeView } from './browser'
import { pageMeta } from './capture'
import { addRecord, hashImage, newId, writeImage, writeText, type DesignSystemRecord } from './library'

type Tokens = DesignSystemRecord['tokens']
type TypeScale = DesignSystemRecord['typeScale']

/**
 * Walks the rendered page and counts what it actually uses. Everything here is *observed*;
 * the inference (which colour is "primary", which spacing values form a scale) happens
 * below in Node so the page never decides how its own design gets labelled.
 */
const PROFILE_SCRIPT = `(() => {
  const nodes = [...document.querySelectorAll('body *')].slice(0, 4000)
  const bump = (map, key) => { if (key) map[key] = (map[key] || 0) + 1 }

  const colors = {}, backgrounds = {}, families = {}, weights = {}, sizes = {}
  const spacing = {}, radii = {}, shadows = {}

  for (const el of nodes) {
    const cs = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue

    if (el.textContent && el.textContent.trim().length > 0) bump(colors, cs.color)
    if (cs.backgroundColor && !/rgba\\(0, 0, 0, 0\\)/.test(cs.backgroundColor)) bump(backgrounds, cs.backgroundColor)

    bump(families, cs.fontFamily.split(',')[0].replace(/["']/g, '').trim())
    bump(weights, cs.fontWeight)
    bump(sizes, cs.fontSize)

    for (const key of ['paddingTop', 'paddingLeft', 'marginBottom', 'gap', 'rowGap']) {
      const v = cs[key]
      // Negative margins are layout hacks, not scale steps.
      if (v && v !== '0px' && v !== 'normal' && parseFloat(v) > 0 && parseFloat(v) < 200) bump(spacing, v)
    }
    if (cs.borderRadius && cs.borderRadius !== '0px') bump(radii, cs.borderRadius)
    if (cs.boxShadow && cs.boxShadow !== 'none') bump(shadows, cs.boxShadow)
  }

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

  return {
    colors, backgrounds, families, weights, sizes, spacing, radii, shadows,
    variables, breakpoints: [...breakpoints].slice(0, 12), typeScale,
    title: document.title
  }
})()`

type Raw = {
  colors: Record<string, number>
  backgrounds: Record<string, number>
  families: Record<string, number>
  weights: Record<string, number>
  sizes: Record<string, number>
  spacing: Record<string, number>
  radii: Record<string, number>
  shadows: Record<string, number>
  variables: Record<string, string>
  breakpoints: string[]
  typeScale: TypeScale
  title: string
}

const byCount = (map: Record<string, number>, limit: number): string[] =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value)

const px = (value: string): number => parseFloat(value) || 0

/** Relative luminance, used only to guess which observed colour plays which role. */
function luminance(color: string): number {
  const m = color.match(/-?[\d.]+/g)
  if (!m || m.length < 3) return 0.5
  const [r, g, b] = m.slice(0, 3).map(Number)
  // lab()/oklab() values arrive with L first on a 0-100 scale.
  if (/^(lab|oklab|oklch|lch)/.test(color)) return Math.min(1, Math.max(0, r / 100))
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Roles are inferred, never observed — the UI labels them as such. */
function inferRoles(colors: string[], backgrounds: string[]): Tokens['colors'] {
  const out: Tokens['colors'] = []
  const seen = new Set<string>()
  const add = (value: string, role: string, inferred: boolean): void => {
    if (!value || seen.has(value)) return
    seen.add(value)
    out.push({ value, count: 0, role, inferred })
  }

  // These four are Nisaba reading meaning into what it measured.
  const sortedBg = [...backgrounds].sort((a, b) => luminance(a) - luminance(b))
  add(sortedBg[0], 'surface / darkest', true)
  add(sortedBg[sortedBg.length - 1], 'surface / lightest', true)
  add(colors[0], 'body text', true)
  const accent = backgrounds.find((c) => {
    const l = luminance(c)
    return l > 0.12 && l < 0.82 && !seen.has(c)
  })
  add(accent ?? '', 'likely accent', true)

  // These are plain measurements and are labelled as such.
  for (const value of backgrounds) add(value, 'background', false)
  for (const value of colors) add(value, 'text', false)
  return out.slice(0, 14)
}

function toTokens(raw: Raw): Tokens {
  const colors = byCount(raw.colors, 10)
  const backgrounds = byCount(raw.backgrounds, 10)
  const families = byCount(raw.families, 4)
  const weights = byCount(raw.weights, 6).sort((a, b) => px(a) - px(b))
  const sizes = byCount(raw.sizes, 10).sort((a, b) => px(a) - px(b))

  return {
    colors: inferRoles(colors, backgrounds),
    fonts: families.map((family) => ({ family, weights, sizes })),
    spacing: byCount(raw.spacing, 10).sort((a, b) => px(a) - px(b)),
    radii: byCount(raw.radii, 6).sort((a, b) => px(a) - px(b)),
    shadows: byCount(raw.shadows, 4),
    breakpoints: raw.breakpoints,
    variables: raw.variables
  }
}

function toMarkdown(host: string, url: string, tokens: Tokens, typeScale: TypeScale): string {
  const list = (values: string[]): string =>
    values.length ? values.map((v) => `- \`${v}\``).join('\n') : '- _none observed_'

  return `# Design profile — ${host}

> Extracted by Nisaba from ${url} on ${new Date().toISOString().slice(0, 10)}.
> **Observed** values were measured from the rendered page. **Inferred** values are Nisaba's
> reading of them and should be checked before you rely on them.

## Colours

| Value | Reading |
| --- | --- |
${tokens.colors.map((c) => `| \`${c.value}\` | ${c.role}${c.inferred ? ' _(inferred)_' : ' _(observed)_'} |`).join('\n')}

## Typography

Families observed: ${tokens.fonts.map((f) => `\`${f.family}\``).join(', ') || '_none_'}

| Element | Size | Weight | Line height | Family |
| --- | --- | --- | --- | --- |
${typeScale.map((t) => `| \`${t.tag}\` | ${t.size} | ${t.weight} | ${t.lineHeight} | ${t.family} |`).join('\n')}

Sizes in use: ${tokens.fonts[0]?.sizes.map((s) => `\`${s}\``).join(', ') || '_none_'}

## Spacing scale _(inferred from observed padding, margin and gap)_

${list(tokens.spacing)}

## Radii

${list(tokens.radii)}

## Shadows

${list(tokens.shadows)}

## Breakpoints _(from first-party media queries)_

${list(tokens.breakpoints)}

## CSS custom properties declared on :root

${
  Object.keys(tokens.variables).length
    ? Object.entries(tokens.variables)
        .slice(0, 60)
        .map(([k, v]) => `- \`${k}: ${v}\``)
        .join('\n')
    : '- _none declared_'
}

---

_Cross-origin stylesheets cannot be read, so a site that ships its CSS from another domain will
show fewer variables and breakpoints than it really has._
`
}

export function registerDesignIpc(): void {
  ipcMain.handle('design:profile', async (): Promise<DesignSystemRecord> => {
    const view = activeView()
    if (!view) throw new Error('Open a page before profiling it')

    const raw = (await view.webContents.executeJavaScript(PROFILE_SCRIPT, true)) as Raw
    const page = pageMeta(view)
    const tokens = toTokens(raw)
    const designMd = toMarkdown(page.host, page.url, tokens, raw.typeScale)

    const id = newId()
    const image = await view.webContents.capturePage()
    const png = image.toPNG()
    const file = await writeImage('design-systems', id, png)
    await writeText('design-systems', `${id}.md`, designMd)
    await writeText(
      'design-systems',
      `${id}.tokens.json`,
      JSON.stringify({ source: page.url, tokens, typeScale: raw.typeScale }, null, 2)
    )

    return addRecord('designSystems', {
      id,
      createdAt: Date.now(),
      name: `${page.host} design profile`,
      host: page.host,
      url: page.url,
      file,
      phash: await hashImage(png),
      tokens,
      typeScale: raw.typeScale,
      designMd
    })
  })
}

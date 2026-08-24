import { ipcMain } from 'electron'
import { activeView } from './browser'
import { PROFILE_SCRIPT } from './design-script'
import { pageMeta } from './capture'
import { addRecord, hashImage, newId, writeImage, writeText, type DesignSystemRecord } from './library'
import {
  DEFAULT_LEVELS,
  toDesignMd,
  type ComponentSpec,
  completeComponents,
  resolveFont,
  type DesignSpec,
  type Levels,
  type TypeToken
} from '../shared/design-spec'

type Tokens = DesignSystemRecord['tokens']
type TypeScale = DesignSystemRecord['typeScale']

/** One measured control, exactly as the page computed it. */
type Shot = {
  background: string
  color: string
  borderColor: string
  borderWidth: string
  radius: string
  padding: string
  height: string
  width: number
  shadow: string
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  letterSpacing: string
  text: string
}

export type Raw = {
  colors: Record<string, number>
  backgrounds: Record<string, number>
  families: Record<string, number>
  weights: Record<string, number>
  sizes: Record<string, number>
  textSizes: Record<string, number>
  spacing: Record<string, number>
  radii: Record<string, number>
  shadows: Record<string, number>
  borderColors: Record<string, number>
  variables: Record<string, string>
  breakpoints: string[]
  typeScale: TypeScale
  surface: string
  bodyStack: string
  headingStack: string
  buttons: Shot[]
  inputs: Shot[]
  selects: Shot[]
  cards: Shot[]
  title: string
  description: string
}

const byCount = (map: Record<string, number>, limit: number): string[] =>
  Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value)

const px = (value: string): number => parseFloat(value) || 0

function rgb(color: string): [number, number, number] | null {
  const m = color.match(/-?[\d.]+/g)
  if (!m || m.length < 3) return null
  return [Number(m[0]), Number(m[1]), Number(m[2])]
}

/** Relative luminance, used only to guess which observed colour plays which role. */
function luminance(color: string): number {
  const parts = rgb(color)
  if (!parts) return 0.5
  // lab()/oklab() values arrive with L first on a 0-100 scale.
  if (/^(lab|oklab|oklch|lch)/.test(color)) return Math.min(1, Math.max(0, parts[0] / 100))
  return (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255
}

/** 0 for any grey, 1 for a fully saturated hue — what separates a brand fill from a surface. */
function chroma(color: string): number {
  const parts = rgb(color)
  if (!parts) return 0
  if (/^(lab|oklab|oklch|lch)/.test(color)) return Math.min(1, Math.abs(parts[1]) / 0.3)
  const [r, g, b] = parts
  const max = Math.max(r, g, b)
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max
}

const opaque = (color: string): boolean => {
  const m = color.match(/rgba?\([^)]*\)/)
  if (!m) return Boolean(color)
  const parts = color.match(/-?[\d.]+/g)
  return !parts || parts.length < 4 || Number(parts[3]) > 0.65
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

/* ------------------------------------------------------- spec construction */

/**
 * Sorts the sampled buttons into primary / secondary / tertiary. "Primary" is the one that
 * shouts loudest: an opaque fill, coloured rather than grey, distinct from the page surface.
 * Tertiary is the quiet end — no fill, no border, i.e. a link or ghost button.
 */
export function rankButtons(buttons: Shot[], surface: string): {
  primary?: Shot
  secondary?: Shot
  tertiary?: Shot
} {
  const surfaceLuminance = luminance(surface)
  const score = (b: Shot): number => {
    if (!b.background) return 0
    if (!opaque(b.background)) return 0.5
    const contrast = Math.abs(luminance(b.background) - surfaceLuminance)
    // Colour counts for more than contrast: a black CTA on white and a brand-purple CTA on
    // white both score, but the coloured one wins when a page has both.
    return 1 + contrast * 2 + chroma(b.background) * 3
  }

  const ranked = [...buttons].sort((a, b) => score(b) - score(a))
  const primary = ranked.find((b) => score(b) > 1)
  const secondary = ranked.find(
    (b) => b !== primary && (b.background || b.borderColor) && score(b) <= (primary ? score(primary) : Infinity)
  )
  const tertiary = ranked.find((b) => b !== primary && b !== secondary && !b.background && !b.borderColor)

  return { primary, secondary, tertiary }
}

/** The most representative sample of a set — the shape that repeats, not the first one seen. */
function typical(shots: Shot[]): Shot | undefined {
  if (shots.length <= 1) return shots[0]
  const key = (s: Shot): string => `${s.radius}|${s.height}|${s.background}`
  const counts = new Map<string, number>()
  for (const shot of shots) counts.set(key(shot), (counts.get(key(shot)) ?? 0) + 1)
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  return shots.find((s) => key(s) === winner)
}

/** Buckets the observed radii into the spec's named scale, keeping only steps that exist. */
function roundedScale(radii: string[]): Record<string, string> {
  const values = [...new Set(radii.map(px))].filter((n) => n > 0).sort((a, b) => a - b)
  const out: Record<string, string> = { none: '0px' }
  if (values.length === 0) return out

  const finite = values.filter((n) => n < 900)
  const names = ['sm', 'md', 'lg', 'xl']
  // Spread the observed values across the named steps rather than inventing a ratio.
  finite.slice(0, 4).forEach((value, i) => {
    out[names[i]] = `${value}px`
  })
  if (!out.md && out.sm) out.md = out.sm
  if (values.some((n) => n >= 900)) out.full = '9999px'
  return out
}

/** A base unit plus the steps actually seen, so a consumer can rebuild the rhythm. */
function spacingScale(spacing: string[]): Record<string, string> {
  const values = [...new Set(spacing.map(px))].filter((n) => n > 0).sort((a, b) => a - b)
  if (values.length === 0) return { unit: '8px' }

  // The smallest value that most others are a multiple of is the grid the page is drawn on.
  const candidates = values.filter((n) => n >= 2 && n <= 24)
  const unit =
    candidates.sort(
      (a, b) =>
        values.filter((v) => v % b < 0.6).length - values.filter((v) => v % a < 0.6).length || a - b
    )[0] ?? values[0]

  const out: Record<string, string> = { unit: `${unit}px` }
  const names = ['xs', 'sm', 'md', 'lg', 'xl', '2xl']
  values.slice(0, 6).forEach((value, i) => {
    out[names[i]] = `${value}px`
  })
  return out
}

const typeToken = (s: {
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  letterSpacing?: string
}): TypeToken => ({
  fontFamily: s.fontFamily,
  fontSize: s.fontSize,
  fontWeight: s.fontWeight,
  lineHeight: s.lineHeight === 'normal' ? '1.4' : s.lineHeight,
  letterSpacing: s.letterSpacing
})

/** The size most of the page's prose is actually set at — not whatever the first <p> is. */
function bodySize(textSizes: Record<string, number>, fallback: string): string {
  const ranked = Object.entries(textSizes)
    // A 60px hero line wins on characters only on a page with almost no copy; cap the range
    // to what body text plausibly is so a display face cannot capture the slot.
    .filter(([size]) => px(size) >= 11 && px(size) <= 22)
    .sort((a, b) => b[1] - a[1])
  return ranked[0]?.[0] ?? fallback
}

/**
 * Maps the page onto the spec's recommended typography names. Body sizes come from the text
 * histogram rather than from the first matching element, and every face is rewritten to the
 * resolved stack so a preview renders in the right register instead of falling back to Times.
 */
function typographyScale(
  typeScale: TypeScale,
  raw: Raw,
  fonts: DesignSpec['fonts'],
  control: Shot | undefined
): Record<string, TypeToken> {
  const NAMES: Record<string, string> = {
    h1: 'display-lg',
    h2: 'headline-lg',
    h3: 'headline-md',
    h4: 'title-md',
    small: 'body-sm'
  }
  const out: Record<string, TypeToken> = {}
  for (const step of typeScale) {
    const name = NAMES[step.tag]
    if (!name || out[name]) continue
    out[name] = typeToken({
      fontFamily: fonts.heading.stack,
      fontSize: step.size,
      fontWeight: step.weight,
      lineHeight: step.lineHeight
    })
  }

  const paragraph = typeScale.find((t) => t.tag === 'p')
  const size = bodySize(raw.textSizes, paragraph?.size ?? '16px')
  out['body-md'] = typeToken({
    fontFamily: fonts.body.stack,
    fontSize: size,
    fontWeight: '400',
    lineHeight: paragraph?.lineHeight && paragraph.lineHeight !== 'normal' ? paragraph.lineHeight : '1.55'
  })
  out['body-sm'] = typeToken({
    fontFamily: fonts.body.stack,
    fontSize: `${Math.max(11, Math.round(px(size) * 0.875))}px`,
    fontWeight: '400',
    lineHeight: '1.5'
  })
  // Every spec needs a heading token even on a page with no <h2>.
  if (!out['headline-md']) {
    out['headline-md'] = typeToken({
      fontFamily: fonts.heading.stack,
      fontSize: `${Math.round(px(size) * 1.5)}px`,
      fontWeight: '600',
      lineHeight: '1.25'
    })
  }
  out['label-md'] = typeToken({
    fontFamily: fonts.body.stack,
    fontSize: control?.fontSize ?? `${Math.max(13, Math.round(px(size) * 0.9375))}px`,
    fontWeight: control?.fontWeight ?? '500',
    lineHeight: '1.2',
    letterSpacing: control?.letterSpacing
  })
  return out
}

function toComponent(shot: Shot | undefined, typography?: string): ComponentSpec | undefined {
  if (!shot) return undefined
  return {
    backgroundColor: shot.background || 'transparent',
    textColor: shot.color,
    borderColor: shot.borderColor || undefined,
    borderWidth: shot.borderColor ? shot.borderWidth : undefined,
    rounded: shot.radius,
    padding: shot.padding,
    height: shot.height,
    shadow: shot.shadow || undefined,
    typography
  }
}

/** Assembles everything measured into the DESIGN.md model. */
export function buildSpec(raw: Raw, host: string): DesignSpec {
  const { primary, secondary, tertiary } = rankButtons(raw.buttons, raw.surface)
  const input = typical(raw.inputs)
  const select = typical(raw.selects)
  const card = typical(raw.cards)
  const bodyText = byCount(raw.colors, 1)[0] ?? 'rgb(17, 17, 17)'
  const outline = byCount(raw.borderColors, 1)[0]

  const fonts = {
    body: resolveFont(raw.bodyStack || 'system-ui, sans-serif'),
    heading: resolveFont(raw.headingStack || raw.bodyStack || 'system-ui, sans-serif')
  }

  const colors: Record<string, string> = { surface: raw.surface, 'on-surface': bodyText }
  if (card?.background) colors['surface-container'] = card.background
  if (primary?.background) {
    colors.primary = primary.background
    colors['on-primary'] = primary.color
  }
  if (secondary?.background || secondary?.borderColor) {
    colors.secondary = secondary.background || secondary.borderColor
    colors['on-secondary'] = secondary.color
  }
  if (tertiary) colors.tertiary = tertiary.color
  if (outline) colors.outline = outline

  const components: Record<string, ComponentSpec> = {}
  const put = (name: string, spec: ComponentSpec | undefined): void => {
    if (spec) components[name] = spec
  }
  put('button-primary', toComponent(primary, '{typography.label-md}'))
  put('button-secondary', toComponent(secondary, '{typography.label-md}'))
  put('button-tertiary', toComponent(tertiary, '{typography.label-md}'))
  put('input-field', toComponent(input, '{typography.body-md}'))
  put('select-field', toComponent(select, '{typography.body-md}'))
  put('card', toComponent(card))

  const rounded = roundedScale(byCount(raw.radii, 8))
  const spacing = spacingScale(byCount(raw.spacing, 10))
  // Controls on one page are almost always the same height; borrow whichever we did measure.
  const height = primary?.height ?? input?.height ?? select?.height ?? secondary?.height ?? '44px'
  const derived = completeComponents(components, { colors, rounded, spacing, height })

  const description =
    raw.description.trim().slice(0, 220) ||
    `Design tokens measured from ${host}${raw.title ? ` \u2014 ${raw.title.slice(0, 80)}` : ''}.`

  return {
    name: `${host} design profile`,
    description,
    colors,
    typography: typographyScale(raw.typeScale, raw, fonts, primary ?? input ?? secondary),
    rounded,
    spacing,
    components,
    fonts,
    derived,
    notes: {
      breakpoints: raw.breakpoints,
      shadows: byCount(raw.shadows, 4),
      variables: raw.variables
    }
  }
}

export function registerDesignIpc(): void {
  ipcMain.handle('design:profile', async (): Promise<DesignSystemRecord> => {
    const view = activeView()
    if (!view) throw new Error('Open a page before profiling it')

    const raw = (await view.webContents.executeJavaScript(PROFILE_SCRIPT, true)) as Raw
    const page = pageMeta(view)
    const tokens = toTokens(raw)
    const createdAt = Date.now()
    const spec = buildSpec(raw, page.host)
    const designMd = toDesignMd(spec, { ...page, capturedAt: createdAt }, DEFAULT_LEVELS)

    const id = newId()
    const image = await view.webContents.capturePage()
    const png = image.toPNG()
    const file = await writeImage('design-systems', id, png)
    await writeText('design-systems', `${id}.md`, designMd)
    await writeText(
      'design-systems',
      `${id}.tokens.json`,
      JSON.stringify({ source: page.url, spec, tokens, typeScale: raw.typeScale }, null, 2)
    )
    // Every control the page actually declared, before the heuristics collapsed them into one
    // of each. This is the evidence a later refinement pass reasons over.
    await writeText('design-systems', `${id}.raw.json`, JSON.stringify(raw))

    return addRecord('designSystems', {
      id,
      createdAt,
      name: spec.name,
      host: page.host,
      url: page.url,
      file,
      phash: await hashImage(png),
      tokens,
      typeScale: raw.typeScale,
      spec,
      levels: DEFAULT_LEVELS,
      designMd
    })
  })

  /** Re-emits DESIGN.md at new levels and files it back beside the original. */
  ipcMain.handle(
    'design:restyle',
    async (_e, record: DesignSystemRecord, levels: Levels): Promise<string> => {
      if (!record.spec) throw new Error('This profile predates levels — re-profile the page')
      const designMd = toDesignMd(
        record.spec,
        { url: record.url, host: record.host, capturedAt: record.createdAt },
        levels
      )
      await writeText('design-systems', `${record.id}.md`, designMd)
      return designMd
    }
  )
}

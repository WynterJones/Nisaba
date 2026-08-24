/**
 * The DESIGN.md model, shared by the main process (which measures a page into it) and the
 * renderer (which previews it and re-emits it as the user changes levels).
 *
 * Format follows the DESIGN.md spec: YAML front matter of tokens, then `##` sections in a
 * fixed order. https://github.com/google-labs-code/design.md
 */

export type Level = 1 | 2 | 3

/**
 * Three dials over the measured tokens. Level 2 is always the page exactly as observed;
 * 1 and 3 are Nisaba's derivations, which is why the UI labels 2 as "as measured".
 */
export type Levels = { shape: Level; density: Level; emphasis: Level }

export const DEFAULT_LEVELS: Levels = { shape: 2, density: 2, emphasis: 2 }

export const LEVEL_LABELS: Record<keyof Levels, [string, string, string]> = {
  shape: ['Sharp', 'As measured', 'Pill'],
  density: ['Compact', 'As measured', 'Roomy'],
  emphasis: ['Flat', 'As measured', 'Elevated']
}

export type TypeToken = {
  fontFamily: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  letterSpacing?: string
}

export type ComponentSpec = {
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  borderWidth?: string
  rounded?: string
  padding?: string
  height?: string
  shadow?: string
  /** Token reference into `typography`, e.g. `label-md`. */
  typography?: string
}

/** Canonical component names Nisaba samples for. Order is the order they preview in. */
export const COMPONENT_ORDER = [
  'button-primary',
  'button-secondary',
  'button-tertiary',
  'input-field',
  'select-field',
  'card'
] as const

export type ComponentName = (typeof COMPONENT_ORDER)[number]

/** What the page asked for, and the Google font that stands in for it when it is not free. */
export type FontChoice = {
  /** The first family in the page's own font stack. */
  requested: string
  /** Closest Google Font, so the preview and any generated code can actually render it. */
  google: string
  category: 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting'
  /** Full CSS stack to apply, Google font first. */
  stack: string
}

export type DesignSpec = {
  name: string
  description: string
  colors: Record<string, string>
  typography: Record<string, TypeToken>
  rounded: Record<string, string>
  spacing: Record<string, string>
  components: Record<string, ComponentSpec>
  /** Body and heading faces, resolved to something that will actually load. */
  fonts: { body: FontChoice; heading: FontChoice }
  /** Components Nisaba had to derive because the page had none — named so the UI can say so. */
  derived: string[]
  /** Kept out of the token block — they are notes about the page, not design tokens. */
  notes: {
    breakpoints: string[]
    shadows: string[]
    variables: Record<string, string>
  }
}

/* ------------------------------------------------------------------- fonts */

/**
 * Common proprietary and system faces mapped to the nearest Google Font. Nothing here is a
 * perfect match — the point is that the preview renders in the right *register* rather than
 * silently falling back to Times.
 */
const GOOGLE_EQUIVALENT: Record<string, string> = {
  // System and near-system sans
  '-apple-system': 'Inter',
  'system-ui': 'Inter',
  'blinkmacsystemfont': 'Inter',
  'sf pro': 'Inter',
  'sf pro text': 'Inter',
  'sf pro display': 'Inter',
  'sf mono': 'Roboto Mono',
  'segoe ui': 'Open Sans',
  'helvetica': 'Inter',
  'helvetica neue': 'Inter',
  'arial': 'Arimo',
  'verdana': 'Open Sans',
  'tahoma': 'Open Sans',
  'trebuchet ms': 'Open Sans',
  // Popular paid/bespoke sans
  'circular': 'Nunito Sans',
  'circular std': 'Nunito Sans',
  'gt america': 'Inter',
  'gt walsheim': 'Poppins',
  'sohne': 'Inter',
  'söhne': 'Inter',
  'graphik': 'Inter',
  'founders grotesk': 'Inter',
  'aeonik': 'Inter',
  'suisse intl': 'Inter',
  'maison neue': 'Inter',
  'proxima nova': 'Montserrat',
  'avenir': 'Nunito Sans',
  'avenir next': 'Nunito Sans',
  'futura': 'Jost',
  'gilroy': 'Poppins',
  'brandon grotesque': 'Josefin Sans',
  'apercu': 'Inter',
  'national': 'Inter',
  'basis grotesque': 'Inter',
  'neue haas grotesk': 'Inter',
  'akzidenz-grotesk': 'Inter',
  'univers': 'Inter',
  'frutiger': 'Inter',
  // Serif
  'times': 'Libre Baskerville',
  'times new roman': 'Libre Baskerville',
  'georgia': 'Lora',
  'garamond': 'EB Garamond',
  'baskerville': 'Libre Baskerville',
  'didot': 'Playfair Display',
  'bodoni': 'Playfair Display',
  'caslon': 'Libre Caslon Text',
  'tiempos': 'Source Serif 4',
  'tiempos text': 'Source Serif 4',
  'canela': 'Playfair Display',
  'freight': 'Source Serif 4',
  'publico': 'Source Serif 4',
  // Mono
  'menlo': 'Roboto Mono',
  'monaco': 'Roboto Mono',
  'consolas': 'Roboto Mono',
  'courier': 'Courier Prime',
  'courier new': 'Courier Prime',
  'ui-monospace': 'JetBrains Mono',
  'operator mono': 'JetBrains Mono',
  'fira code': 'Fira Code'
}

/** Faces that ARE Google Fonts — used verbatim rather than substituted. */
const KNOWN_GOOGLE = new Set(
  [
    'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway', 'Nunito',
    'Nunito Sans', 'Work Sans', 'Rubik', 'Karla', 'Manrope', 'DM Sans', 'Plus Jakarta Sans',
    'Figtree', 'Outfit', 'Sora', 'Space Grotesk', 'Barlow', 'Mulish', 'Quicksand', 'Jost',
    'Josefin Sans', 'Oswald', 'Archivo', 'Public Sans', 'Source Sans 3', 'IBM Plex Sans',
    'Merriweather', 'Playfair Display', 'Lora', 'PT Serif', 'Libre Baskerville', 'EB Garamond',
    'Source Serif 4', 'Crimson Text', 'Bitter', 'Cormorant Garamond', 'Libre Caslon Text',
    'Roboto Mono', 'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Space Mono', 'Courier Prime',
    'Inconsolata', 'Arimo', 'Bebas Neue', 'Anton', 'Caveat', 'Dancing Script'
  ].map((name) => name)
)

const GENERIC_FALLBACK: Record<FontChoice['category'], string> = {
  'sans-serif': 'Inter',
  serif: 'Source Serif 4',
  monospace: 'JetBrains Mono',
  display: 'Archivo',
  handwriting: 'Caveat'
}

const clean = (family: string): string => family.replace(/["']/g, '').trim()

/** CSS generic keywords — real fallbacks, but never families to list ahead of one. */
const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'math', 'emoji',
  'fangsong', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded'
])

/** Reads the generic keyword the page itself declared at the end of its stack. */
function categoryOf(stack: string, first: string): FontChoice['category'] {
  const lower = `${stack} ${first}`.toLowerCase()
  if (/\bmonospace\b|\bmono\b|\bcode\b|courier|consol/.test(lower)) return 'monospace'
  if (/\bcursive\b|script|handwriting/.test(lower)) return 'handwriting'
  if (/\bserif\b(?!-)/.test(lower) && !/sans-serif/.test(lower)) return 'serif'
  if (/\bfantasy\b|display/.test(lower)) return 'display'
  return 'sans-serif'
}

/**
 * Picks a Google Font for an observed family: itself if it is one, a curated equivalent if we
 * know it, otherwise the default for its generic category. Never returns an empty face — a
 * preview that falls back to Times misrepresents the page more than a close substitute does.
 */
export function resolveFont(stack: string): FontChoice {
  const families = stack.split(',').map(clean).filter(Boolean)
  const requested = families[0] || 'system-ui'
  const category = categoryOf(stack, requested)

  let google = ''
  for (const family of families) {
    const key = family.toLowerCase()
    if (KNOWN_GOOGLE.has(family)) {
      google = family
      break
    }
    if (GOOGLE_EQUIVALENT[key]) {
      google = GOOGLE_EQUIVALENT[key]
      break
    }
  }
  if (!google) google = GENERIC_FALLBACK[category]

  const generic = category === 'display' ? 'sans-serif' : category
  // Generic keywords are dropped from the middle and re-added once at the end, or a stack like
  // "Inter, sans-serif" becomes "Inter, sans-serif, sans-serif".
  const named = families.filter((f) => f !== google && !GENERIC.has(f.toLowerCase()))
  const parts = [google, ...named]
  return { requested, google, category, stack: `${parts.map(quoteFamily).join(', ')}, ${generic}` }
}

const quoteFamily = (family: string): string => (/\s/.test(family) ? `"${family}"` : family)

/** The stylesheet URL that makes a spec's faces actually load. */
export function googleFontsHref(fonts: DesignSpec['fonts']): string {
  const families = [...new Set([fonts.body.google, fonts.heading.google])]
  const params = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@300;400;500;600;700;800`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

/* ------------------------------------------------------------------ levels */

const NUMBER = /-?\d*\.?\d+/g

/** Scales every length in a value ("12px 20px", "1rem") leaving units and keywords alone. */
export function scaleLength(value: string | undefined, factor: number, max = Infinity): string {
  if (!value) return ''
  if (factor === 1) return value
  return value.replace(NUMBER, (n) => {
    const scaled = Math.min(parseFloat(n) * factor, max)
    return String(Math.round(scaled * 100) / 100)
  })
}

const isFull = (value: string | undefined): boolean => parseFloat(value ?? '0') >= 999

const SHAPE_FACTOR: Record<Level, number> = { 1: 0.25, 2: 1, 3: 2.6 }
const DENSITY_FACTOR: Record<Level, number> = { 1: 0.72, 2: 1, 3: 1.35 }

/** Components whose shape reads as a pill at level 3 rather than merely rounder. */
const PILL_AT_3 = new Set(['button-primary', 'button-secondary', 'button-tertiary', 'input-field', 'select-field'])

/**
 * Applies the three level dials to a measured spec. Pure — the stored spec is never mutated,
 * so switching back to level 2 always restores exactly what was on the page.
 */
export function applyLevels(spec: DesignSpec, levels: Levels): DesignSpec {
  const shape = SHAPE_FACTOR[levels.shape]
  const density = DENSITY_FACTOR[levels.density]
  const strongest = spec.notes.shadows[0] ?? '0 8px 24px rgba(0,0,0,0.18)'

  const rounded: Record<string, string> = {}
  for (const [key, value] of Object.entries(spec.rounded)) {
    rounded[key] = isFull(value) ? value : scaleLength(value, shape, 64)
  }

  const spacing: Record<string, string> = {}
  for (const [key, value] of Object.entries(spec.spacing)) {
    spacing[key] = scaleLength(value, density)
  }

  const components: Record<string, ComponentSpec> = {}
  for (const [name, component] of Object.entries(spec.components)) {
    const pill = levels.shape === 3 && PILL_AT_3.has(name)
    components[name] = {
      ...component,
      rounded: pill
        ? '9999px'
        : isFull(component.rounded)
          ? component.rounded
          : scaleLength(component.rounded, shape, 64),
      padding: scaleLength(component.padding, density),
      height: scaleLength(component.height, density),
      shadow:
        levels.emphasis === 1
          ? 'none'
          : levels.emphasis === 3
            ? (component.shadow && component.shadow !== 'none' ? component.shadow : strongest)
            : component.shadow,
      // Flat leans on the outline for separation where the shadow used to do the work.
      borderWidth:
        levels.emphasis === 1 && (!component.borderWidth || component.borderWidth === '0px')
          ? '1px'
          : component.borderWidth
    }
  }

  return { ...spec, rounded, spacing, components }
}

/* -------------------------------------------------------------- yaml + md */

/** Quotes only where YAML needs it — hex colours, anything with a leading `{` or a colon. */
function yamlValue(value: string): string {
  if (value === '') return '""'
  if (/^[#{]|[:#]\s|^\s|\s$|^[-?*&!|>%@`]/.test(value) || /^(true|false|null|yes|no|on|off)$/i.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`
  }
  return value
}

function yamlBlock(label: string, entries: [string, string][], indent = '  '): string {
  if (entries.length === 0) return ''
  return `${label}:\n${entries.map(([k, v]) => `${indent}${k}: ${yamlValue(v)}`).join('\n')}\n`
}

function typographyBlock(typography: Record<string, TypeToken>): string {
  const names = Object.keys(typography)
  if (names.length === 0) return ''
  const body = names
    .map((name) => {
      const t = typography[name]
      const rows: [string, string][] = [
        ['fontFamily', t.fontFamily],
        ['fontSize', t.fontSize],
        ['fontWeight', t.fontWeight],
        ['lineHeight', t.lineHeight]
      ]
      if (t.letterSpacing && t.letterSpacing !== 'normal') rows.push(['letterSpacing', t.letterSpacing])
      return `  ${name}:\n${rows.map(([k, v]) => `    ${k}: ${yamlValue(v)}`).join('\n')}`
    })
    .join('\n')
  return `typography:\n${body}\n`
}

function componentsBlock(components: Record<string, ComponentSpec>): string {
  const names = Object.keys(components)
  if (names.length === 0) return ''
  const body = names
    .map((name) => {
      const c = components[name]
      const rows = Object.entries(c).filter(
        ([, v]) => v && v !== 'none' && v !== '0px' && v !== 'normal'
      ) as [string, string][]
      if (rows.length === 0) return ''
      return `  ${name}:\n${rows.map(([k, v]) => `    ${k}: ${yamlValue(v)}`).join('\n')}`
    })
    .filter(Boolean)
    .join('\n')
  return `components:\n${body}\n`
}

function frontMatter(spec: DesignSpec): string {
  return [
    '---',
    `version: alpha`,
    `name: ${yamlValue(spec.name)}`,
    `description: ${yamlValue(spec.description)}`,
    yamlBlock('fonts', [
      ['body', spec.fonts.body.google],
      ['heading', spec.fonts.heading.google],
      ['body-requested', spec.fonts.body.requested],
      ['heading-requested', spec.fonts.heading.requested]
    ]),
    yamlBlock('colors', Object.entries(spec.colors)),
    typographyBlock(spec.typography),
    yamlBlock('rounded', Object.entries(spec.rounded)),
    yamlBlock('spacing', Object.entries(spec.spacing)),
    componentsBlock(spec.components),
    '---'
  ]
    .filter((part) => part !== '')
    .join('\n')
    .replace(/\n{2,}/g, '\n')
}

const bullet = (values: string[]): string =>
  values.length ? values.map((v) => `- \`${v}\``).join('\n') : '- _none observed_'

const SHAPE_PROSE: Record<Level, string> = {
  1: 'This system is set to **Sharp** (Level 1): radii are pulled close to zero, so edges read as precise and technical rather than soft.',
  2: 'This system is set to **Rounded** (Level 2): the radii below are exactly what the page uses.',
  3: 'This system is set to **Pill** (Level 3): action elements are fully rounded and containers are noticeably softer than the source page.'
}

const DENSITY_PROSE: Record<Level, string> = {
  1: 'Spacing is **Compact** (Level 1) — roughly three-quarters of the measured rhythm, for dense, data-heavy screens.',
  2: 'Spacing is **As measured** (Level 2) — the rhythm the page actually uses.',
  3: 'Spacing is **Roomy** (Level 3) — the measured rhythm opened up by about a third, for marketing and editorial layouts.'
}

const EMPHASIS_PROSE: Record<Level, string> = {
  1: 'Depth is **Flat** (Level 1): no shadows at all. Surfaces are separated by a 1px outline and background shifts only.',
  2: 'Depth is **As measured** (Level 2): the shadows below are the ones the page ships.',
  3: 'Depth is **Elevated** (Level 3): every surface carries the page’s strongest observed shadow, so the stack reads as physically layered.'
}

/**
 * Emits a spec-compliant DESIGN.md. Sections use `##` headings in the canonical order the
 * spec requires; anything Nisaba could not measure is left out rather than invented.
 */
export function toDesignMd(
  spec: DesignSpec,
  source: { url: string; host: string; capturedAt: number },
  levels: Levels
): string {
  const resolved = applyLevels(spec, levels)
  const date = new Date(source.capturedAt).toISOString().slice(0, 10)

  const componentProse = COMPONENT_ORDER.filter((name) => resolved.components[name])
    .map((name) => {
      const c = resolved.components[name]
      const bits = [
        c.backgroundColor && `background \`${c.backgroundColor}\``,
        c.textColor && `text \`${c.textColor}\``,
        c.rounded && `radius \`${c.rounded}\``,
        c.height && `height \`${c.height}\``,
        c.padding && `padding \`${c.padding}\``
      ].filter(Boolean)
      return `- **${name}** — ${bits.join(', ') || 'no distinguishing tokens measured'}.`
    })
    .join('\n')

  return `${frontMatter(resolved)}

## Overview

${spec.description}

Measured by Nisaba from ${source.url} on ${date}. The tokens above are what the rendered page
actually computed to; the prose is a reading of them. Shape, density and depth are set to
Level ${levels.shape}, ${levels.density} and ${levels.emphasis} respectively — Level 2 on every dial is the page untouched.

## Colors

${Object.entries(resolved.colors)
  .map(([name, value]) => `- **${name}** — \`${value}\``)
  .join('\n')}

Roles are inferred from where each colour was used: the page background becomes \`surface\`, body
text becomes \`on-surface\`, and the filled call-to-action becomes \`primary\`. Check them against
the site's own naming before treating them as canonical.

## Typography

The page sets its body in **${spec.fonts.body.requested}** and its headings in **${spec.fonts.heading.requested}**.
Those are not always licensable, so the tokens above name the closest Google Font —
**${spec.fonts.body.google}** for body and **${spec.fonts.heading.google}** for headings — with the original
kept in the stack ahead of the generic fallback, so an implementation renders correctly either way.

| Token | Size | Weight | Line height |
| --- | --- | --- | --- |
${Object.entries(resolved.typography)
  .map(([name, t]) => `| \`${name}\` | ${t.fontSize} | ${t.fontWeight} | ${t.lineHeight} |`)
  .join('\n')}

## Layout & Spacing

${DENSITY_PROSE[levels.density]}

${Object.entries(resolved.spacing)
  .map(([name, value]) => `- **${name}** — \`${value}\``)
  .join('\n')}

${resolved.notes.breakpoints.length ? `Breakpoints found in first-party CSS:\n\n${bullet(resolved.notes.breakpoints)}` : 'No first-party media queries were readable — a site serving CSS cross-origin will hide them.'}

## Elevation & Depth

${EMPHASIS_PROSE[levels.emphasis]}

${bullet(resolved.notes.shadows)}

## Shapes

${SHAPE_PROSE[levels.shape]}

${Object.entries(resolved.rounded)
  .map(([name, value]) => `- **${name}** — \`${value}\``)
  .join('\n')}

## Components

${componentProse || '_No components could be sampled on this page._'}

${
  spec.derived.length
    ? `The page had no ${spec.derived.map((n) => `\`${n}\``).join(', ')}, so ${spec.derived.length === 1 ? 'it was' : 'they were'} derived from what was measured — the primary fill, the outline colour, the radius scale and the spacing unit. Treat ${spec.derived.length === 1 ? 'it' : 'them'} as a starting point that fits the rest of the system, not as an observation.`
    : 'Every component above was measured directly from the page.'
}

## Do's and Don'ts

- **Do** treat the token block as the contract — the prose explains it, it does not override it.
- **Do** re-measure after the source page changes; these values are a snapshot from ${date}.
- **Don't** copy the source brand. Reproduce spacing, hierarchy and interaction, and replace
  copy, logos and imagery with your own.
- **Don't** trust a colour role Nisaba guessed if the site publishes its own token names.
`
}

/* -------------------------------------------------- derivation of gaps */

const px = (value: string | undefined): number => parseFloat(value ?? '') || 0

function rgb(color: string): [number, number, number] | null {
  const m = color.match(/-?[\d.]+/g)
  if (!m || m.length < 3) return null
  return [Number(m[0]), Number(m[1]), Number(m[2])]
}

/** Relative luminance, used only to decide whether text on a fill should be light or dark. */
function luminance(color: string): number {
  const parts = rgb(color)
  if (!parts) return 0.5
  if (/^(lab|oklab|oklch|lch)/.test(color)) return Math.min(1, Math.max(0, parts[0] / 100))
  return (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255
}

/** Blends a colour toward another by `amount`, used to derive hover/muted surfaces. */
export function mix(color: string, toward: string, amount: number): string {
  const a = rgb(color)
  const b = rgb(toward)
  if (!a || !b) return color
  const out = a.map((v, i) => Math.round(v + (b[i] - v) * amount))
  return `rgb(${out[0]}, ${out[1]}, ${out[2]})`
}

/**
 * Fills in whatever the page did not have. A design system with no input, no secondary button
 * or no card is not a usable design system, so these are derived from what *was* measured —
 * the primary fill, the outline colour, the radius scale, the spacing unit — and the names are
 * recorded in `derived` so the UI and the markdown can both say they were not observed.
 */
export function completeComponents(
  components: Record<string, ComponentSpec>,
  input: {
    colors: Record<string, string>
    rounded: Record<string, string>
    spacing: Record<string, string>
    height: string
  }
): string[] {
  const derived: string[] = []
  const { colors, rounded, spacing, height } = input
  const surface = colors.surface ?? 'rgb(255, 255, 255)'
  const onSurface = colors['on-surface'] ?? 'rgb(17, 17, 17)'
  const primary = colors.primary ?? mix(onSurface, surface, 0.1)
  const onPrimary = colors['on-primary'] ?? (luminance(primary) > 0.55 ? onSurface : 'rgb(255, 255, 255)')
  const outline = colors.outline ?? mix(onSurface, surface, 0.78)
  const control = rounded.md ?? rounded.sm ?? rounded.lg ?? '8px'
  const unit = px(spacing.unit ?? '8px') || 8
  const padX = Math.round(unit * 2.5)
  // Vertical padding is whatever the control height leaves around a ~20px line box.
  const padY = Math.max(8, Math.round((px(height) - 20) / 2))

  const add = (name: string, spec: ComponentSpec): void => {
    if (components[name]) return
    components[name] = spec
    derived.push(name)
  }

  add('button-primary', {
    backgroundColor: primary,
    textColor: onPrimary,
    rounded: control,
    padding: `${padY}px ${padX}px`,
    height,
    typography: '{typography.label-md}'
  })

  // Secondary is the same shape with the emphasis taken out: outlined, on the surface.
  add('button-secondary', {
    backgroundColor: 'transparent',
    textColor: components['button-primary']?.backgroundColor === 'transparent' ? onSurface : primary,
    borderColor: outline,
    borderWidth: '1px',
    rounded: components['button-primary']?.rounded ?? control,
    padding: components['button-primary']?.padding ?? `${padY}px ${padX}px`,
    height,
    typography: '{typography.label-md}'
  })

  add('button-tertiary', {
    backgroundColor: 'transparent',
    textColor: mix(onSurface, surface, 0.35),
    rounded: components['button-primary']?.rounded ?? control,
    padding: `${padY}px ${Math.round(unit * 1.5)}px`,
    height,
    typography: '{typography.label-md}'
  })

  const field: ComponentSpec = {
    backgroundColor: mix(surface, onSurface, 0.04),
    textColor: onSurface,
    borderColor: outline,
    borderWidth: '1px',
    rounded: control,
    padding: `${padY}px ${Math.round(unit * 1.5)}px`,
    height,
    typography: '{typography.body-md}'
  }
  add('input-field', field)
  // A page with an input but no select gets the input's own styling, not the generic one.
  add('select-field', components['input-field'] ?? field)

  add('card', {
    backgroundColor: colors['surface-container'] ?? mix(surface, onSurface, 0.03),
    textColor: onSurface,
    borderColor: outline,
    borderWidth: '1px',
    rounded: rounded.lg ?? rounded.xl ?? rounded.md ?? '12px',
    padding: `${Math.round(unit * 3)}px`
  })

  return derived
}


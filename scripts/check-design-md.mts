// Smoke check for the DESIGN.md emitter: the spec requires `##` sections in a fixed order,
// and the level dials must be reversible (level 2 is the page untouched).
// Run: npm run check:design
import assert from 'node:assert/strict'
import {
  applyLevels,
  completeComponents,
  COMPONENT_ORDER,
  googleFontsHref,
  resolveFont,
  toDesignMd,
  DEFAULT_LEVELS,
  type DesignSpec
} from '../src/shared/design-spec.ts'

const spec: DesignSpec = {
  name: 'example.com design profile',
  description: 'A test fixture.',
  colors: { surface: '#ffffff', 'on-surface': '#111111', primary: '#7928db' },
  typography: {
    'headline-lg': { fontFamily: 'Inter', fontSize: '32px', fontWeight: '600', lineHeight: '40px' },
    'body-md': { fontFamily: 'Inter', fontSize: '16px', fontWeight: '400', lineHeight: '24px' }
  },
  rounded: { none: '0px', sm: '4px', md: '8px', full: '9999px' },
  spacing: { unit: '8px', sm: '8px', md: '16px' },
  components: {
    'button-primary': {
      backgroundColor: '#7928db',
      textColor: '#ffffff',
      rounded: '8px',
      padding: '12px 20px',
      height: '44px',
      typography: '{typography.body-md}'
    },
    card: { backgroundColor: '#ffffff', rounded: '12px', padding: '24px', shadow: 'none' }
  },
  fonts: {
    body: resolveFont('Inter, system-ui, sans-serif'),
    heading: resolveFont('Inter, system-ui, sans-serif')
  },
  derived: ['select-field'],
  notes: { breakpoints: ['min-width: 768px'], shadows: ['0 4px 12px rgba(0,0,0,.1)'], variables: {} }
}

// A face that is already a Google font is kept; a proprietary one is substituted; an unknown
// one falls back by the generic keyword the page itself declared, never to nothing.
assert.equal(resolveFont('Inter, sans-serif').google, 'Inter')
assert.equal(resolveFont('"SF Pro Text", -apple-system, sans-serif').google, 'Inter')
assert.equal(resolveFont('Georgia, serif').google, 'Lora')
assert.equal(resolveFont('"Wingding Deluxe", serif').google, 'Source Serif 4')
assert.equal(resolveFont('"Wingding Deluxe", sans-serif').google, 'Inter')
assert.equal(resolveFont('Menlo, monospace').category, 'monospace')
// The original stays ahead of the generic so an implementation renders it when licensed.
assert.match(resolveFont('Circular, sans-serif').stack, /^"?Nunito Sans"?, Circular, sans-serif$/)
assert.match(googleFontsHref(spec.fonts), /^https:\/\/fonts\.googleapis\.com\/css2\?family=Inter/)

const source = { url: 'https://example.com', host: 'example.com', capturedAt: 1700000000000 }

// Level 2 changes nothing — anything else means the dials are lossy.
assert.deepEqual(applyLevels(spec, DEFAULT_LEVELS).rounded, spec.rounded)
assert.equal(
  applyLevels(spec, DEFAULT_LEVELS).components['button-primary'].padding,
  spec.components['button-primary'].padding
)

// Shape 1 shrinks radii, shape 3 pills the action elements but leaves `full` alone.
assert.equal(applyLevels(spec, { ...DEFAULT_LEVELS, shape: 1 }).rounded.md, '2px')
assert.equal(applyLevels(spec, { ...DEFAULT_LEVELS, shape: 3 }).rounded.full, '9999px')
assert.equal(
  applyLevels(spec, { ...DEFAULT_LEVELS, shape: 3 }).components['button-primary'].rounded,
  '9999px'
)

// Density scales every length in a compound value, not just the first.
assert.equal(applyLevels(spec, { ...DEFAULT_LEVELS, density: 1 }).components['button-primary'].padding, '8.64px 14.4px')

// Emphasis 3 lends the page's strongest shadow to a component that had none.
assert.equal(applyLevels(spec, { ...DEFAULT_LEVELS, emphasis: 3 }).components.card.shadow, spec.notes.shadows[0])
assert.equal(applyLevels(spec, { ...DEFAULT_LEVELS, emphasis: 1 }).components.card.shadow, 'none')

// The whole point of completeComponents: a page with nothing on it still yields a full set.
{
  const components = {}
  const derived = completeComponents(components, {
    colors: { surface: '#ffffff', 'on-surface': '#111111' },
    rounded: { none: '0px', md: '6px' },
    spacing: { unit: '8px' },
    height: '40px'
  })
  assert.deepEqual(Object.keys(components).sort(), [...COMPONENT_ORDER].sort())
  assert.deepEqual(derived.sort(), [...COMPONENT_ORDER].sort(), 'all six must be flagged derived')
  // Derived buttons must differ from each other or the preview shows three identical pills.
  const [p1, p2, p3] = ['button-primary', 'button-secondary', 'button-tertiary'].map(
    (n) => components[n]
  )
  assert.notEqual(p1.backgroundColor, p2.backgroundColor, 'secondary must not repeat primary')
  assert.equal(p3.backgroundColor, 'transparent', 'tertiary must be the quiet one')
  assert.ok(components['input-field'].borderColor, 'a derived field needs a visible edge')
}

// A page that HAS a component keeps it, and only the gaps are filled.
{
  const components = { 'button-primary': { backgroundColor: '#f0f', rounded: '3px' } }
  const derived = completeComponents(components, {
    colors: { surface: '#ffffff', 'on-surface': '#111111', primary: '#7928db' },
    rounded: { none: '0px', md: '6px' },
    spacing: { unit: '8px' },
    height: '40px'
  })
  assert.equal(components['button-primary'].backgroundColor, '#f0f', 'measured value overwritten')
  assert.ok(!derived.includes('button-primary'))
  assert.equal(components['button-secondary'].rounded, '3px', 'derived shapes follow the measured one')
}

const md = toDesignMd(spec, source, DEFAULT_LEVELS)

// Front matter must open the file and close before the body.
assert.ok(md.startsWith('---\n'), 'no opening YAML fence')
const close = md.indexOf('\n---\n')
assert.ok(close > 0, 'no closing YAML fence')
assert.ok(md.slice(0, close).includes('name: example.com design profile'))
assert.ok(md.slice(0, close).includes('"#7928db"'), 'hex colours must be quoted for YAML')

// Sections must appear in the spec's canonical order, with no duplicates.
const ORDER = [
  'Overview',
  'Colors',
  'Typography',
  'Layout & Spacing',
  'Elevation & Depth',
  'Shapes',
  'Components',
  "Do's and Don'ts"
]
const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1])
assert.deepEqual(headings, ORDER, `sections out of order: ${headings.join(' | ')}`)
assert.equal(new Set(headings).size, headings.length, 'duplicate headings are rejected by the spec')

// The derived components must be named in the prose, not silently passed off as measured.
assert.ok(md.includes('`select-field`'), 'derived components must be called out')
assert.ok(md.includes('Nunito Sans') === false, 'fixture sanity')
assert.ok(md.includes('closest Google Font'), 'typography section must explain the substitution')

console.log('design.md ok:', headings.length, 'sections,', md.length, 'bytes')

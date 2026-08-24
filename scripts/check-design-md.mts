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
  upgradeSpec,
  mergeRefined,
  parseAgentAnswer,
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

// Profiles captured before fonts, `derived` and the full component set landed are missing
// those keys. Opening one used to throw on `spec.fonts.body`, which took the app down with it.
const legacy = {
  name: 'legacy.com design profile',
  description: 'A profile from before fonts were resolved.',
  colors: { surface: '#ffffff', 'on-surface': '#111111', primary: '#0b5' },
  typography: {
    'body-md': { fontFamily: 'Circular, sans-serif', fontSize: '16px', fontWeight: '400', lineHeight: '24px' }
  },
  rounded: { md: '6px' },
  spacing: { unit: '8px' },
  components: { 'button-primary': { backgroundColor: '#0b5', rounded: '6px', height: '40px' } },
  notes: { breakpoints: [], shadows: [], variables: {} }
} as unknown as DesignSpec

const fixed = upgradeSpec(legacy)
assert.ok(fixed.fonts.body.google, 'a legacy spec must come back with a resolved body font')
assert.ok(
  COMPONENT_ORDER.every((name) => fixed.components[name]),
  'a legacy spec must come back with every component'
)
assert.ok(fixed.derived.includes('input-field'), 'components it never had must be marked derived')
assert.ok(!fixed.derived.includes('button-primary'), 'components it did have must not be')
assert.ok(googleFontsHref(fixed.fonts).startsWith('https://'), 'the font href must be loadable')

const legacyMd = toDesignMd(legacy, { url: 'https://legacy.com', host: 'legacy.com', capturedAt: Date.now() }, DEFAULT_LEVELS)
assert.ok(legacyMd.includes('Nunito Sans'), 'Circular should stand in as Nunito Sans')
assert.equal(upgradeSpec(fixed), fixed, 'a complete spec is returned untouched')

console.log('legacy spec ok:', legacyMd.length, 'bytes,', fixed.derived.length, 'derived')

// An agent's answer is folded onto the measured spec, never trusted wholesale: it may correct
// what the heuristics interpreted, but malformed or missing keys must fall back to what was
// measured, and page facts must survive untouched.
const measured = upgradeSpec(legacy)
const answer = {
  description: 'A calm blue system with rectangular controls.',
  colors: { primary: 'rgb(37, 99, 235)', 'on-primary': 'rgb(255, 255, 255)' },
  components: {
    // The exact failure this pass exists to fix: a pill radius read off something that is not
    // a pill, with a height too small for its own padding.
    'button-primary': {
      backgroundColor: 'rgb(37, 99, 235)',
      textColor: 'rgb(255, 255, 255)',
      rounded: '8px',
      padding: '12px 24px',
      height: '48px',
      typography: '{typography.label-md}'
    },
    // Junk must not survive: wrong types, and a component name that is not in the spec.
    'input-field': { rounded: { nope: true }, padding: 42 },
    'not-a-component': { backgroundColor: 'red' }
  },
  typography: { 'body-md': { fontFamily: 'Inter', fontSize: '16px', lineHeight: '24px' } },
  notes: { variables: { evil: 'should be ignored' } }
}

const refined = mergeRefined(measured, answer)
assert.equal(refined.components['button-primary'].rounded, '8px', 'the agent may fix a radius')
assert.equal(refined.components['button-primary'].height, '48px')
assert.equal(refined.colors.primary, 'rgb(37, 99, 235)', 'the agent may fix a colour')
assert.equal(refined.colors.surface, measured.colors.surface, 'unnamed colours are kept')
assert.equal(
  refined.components['input-field'].rounded,
  measured.components['input-field'].rounded,
  'a malformed component keeps its measured values'
)
assert.equal(refined.components['input-field'].padding, measured.components['input-field'].padding)
assert.ok(!refined.components['not-a-component'], 'unknown component names are dropped')
assert.deepEqual(refined.notes, measured.notes, 'measured page facts are not the agent’s to change')
assert.equal(refined.fonts.body.google, 'Inter', 'fonts stay resolved by Nisaba, from the family')
assert.ok(COMPONENT_ORDER.every((n) => refined.components[n]), 'the result is still complete')

// A refusal, a truncated file or plain garbage must leave the measured spec intact.
for (const junk of [null, 'sorry, I cannot do that', 42, [], { components: 'nope' }]) {
  assert.deepEqual(mergeRefined(measured, junk).components, measured.components, `junk: ${JSON.stringify(junk)}`)
}

console.log('merge ok:', Object.keys(refined.components).length, 'components,', refined.derived.length, 'derived')

// Agents are asked to write refined.json and routinely answer in the transcript instead, so
// the transcript has to be readable — fenced, surrounded by prose, and with a summary after it.
const transcript = `I read the screenshot and the page CSS.

\`\`\`json
{ "colors": { "primary": "rgb(37, 124, 255)" },
  "components": { "button-primary": { "rounded": "4px", "padding": "18px 51px" } } }
\`\`\`

Main correction: button-primary was the round Intercom bubble { not json }.`
const recovered = mergeRefined(measured, parseAgentAnswer(transcript))
assert.equal(recovered.colors.primary, 'rgb(37, 124, 255)', 'a fenced answer must be recovered')
assert.equal(recovered.components['button-primary'].rounded, '4px')
assert.equal(parseAgentAnswer('no json here at all'), null, 'prose alone yields nothing')
assert.deepEqual(
  parseAgentAnswer('Here you go: {"colors":{"primary":"red"}} — done.'),
  { colors: { primary: 'red' } },
  'an unfenced object must still be found'
)

console.log('transcript fallback ok')

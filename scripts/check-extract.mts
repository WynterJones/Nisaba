// Smoke check for the embedded page scripts. They are strings evaluated inside a remote page,
// so a syntax error only surfaces when a user clicks the button — this parses them instead.
// Run: npm run check:extract
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {
  CANCEL_SCRIPT,
  ELEMENT_SCRIPT,
  PAGE_SCRIPT,
  SELECTOR_SCRIPT
} from '../src/main/extract-scripts.ts'
import { PROFILE_SCRIPT } from '../src/main/design-script.ts'

const SCRIPTS = { SELECTOR_SCRIPT, ELEMENT_SCRIPT, PAGE_SCRIPT, CANCEL_SCRIPT, PROFILE_SCRIPT }

for (const [name, source] of Object.entries(SCRIPTS)) {
  try {
    // Compiling is enough: it parses without touching a DOM that does not exist here.
    new vm.Script(source, { filename: `${name}.js` })
  } catch (error) {
    throw new Error(`${name} does not parse: ${(error as Error).message}`)
  }
}

// The page collector must carry the bits that make it a template source rather than a section.
assert.ok(PAGE_SCRIPT.includes('collect(document.body)'), 'page script must collect <body>')
assert.ok(PAGE_SCRIPT.includes('picked.outline'), 'page script must emit a block outline')
assert.match(PAGE_SCRIPT, /nodes: 4000/, 'page script must use the page-sized node budget')
assert.match(SELECTOR_SCRIPT, /nodes: 400\b/, 'selector script must use the section-sized budget')

// Both scripts share one copy of the helpers — a drift here means the split regressed.
for (const fn of ['cssPath', 'sanitized', 'palette', 'tech', 'collect']) {
  assert.ok(SELECTOR_SCRIPT.includes(`function ${fn}(`), `selector script lost ${fn}`)
  assert.ok(PAGE_SCRIPT.includes(`function ${fn}(`), `page script lost ${fn}`)
}

// Element mode is the whole point of the second script: it must gate on the pickable list.
assert.match(ELEMENT_SCRIPT, /const ELEMENT_MODE = true/, 'element script must run in element mode')
assert.match(SELECTOR_SCRIPT, /const ELEMENT_MODE = false/, 'section script must not gate elements')
assert.ok(ELEMENT_SCRIPT.includes('role=\\"button\\"'), 'element script lost the pickable list')

// The profiler must sample real controls, not just count computed styles.
for (const needle of ['buttons', 'inputs', 'selects', 'cards', 'surface']) {
  assert.ok(PROFILE_SCRIPT.includes(needle + ','), `profiler must return ${needle}`)
}

console.log('page scripts ok:', Object.keys(SCRIPTS).join(', '))

// The component sandbox answers `@/…` imports with a module built from the names the file
// asked for. Get that parse wrong and the preview dies with an opaque module error in a window
// the user cannot debug — so parse a real generated component here instead.
// Run: npm run check:preview
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { page, shimModule } from '../src/main/preview-sandbox.ts'

const SOURCE = `"use client";

import * as React from "react";
import { Box, CircleDot, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Card, { CardHeader } from "@/components/ui/card";

export default function NewsletterModal() { return null }
`

const dialog = shimModule(SOURCE, 'components/ui/dialog')
for (const name of ['Dialog', 'DialogContent', 'DialogTitle']) {
  assert.match(dialog, new RegExp(`export const ${name} =`), `dialog shim is missing ${name}`)
}
assert.doesNotMatch(dialog, /export const Button/, 'shims must not leak names from another path')
assert.doesNotMatch(dialog, /export default/, 'a named-only import needs no default export')

// The tag matters: a shimmed Button that renders a div is not interactive or focusable.
assert.match(shimModule(SOURCE, 'components/ui/button'), /export const Button = make\("button"/)
assert.match(shimModule(SOURCE, 'components/ui/input'), /export const Input = make\("input"/)

// `cn` is a helper — shimming it as a component makes every className call return an element.
const utils = shimModule(SOURCE, 'lib/utils')
assert.match(utils, /export const cn = \(\.\.\.a\)/, 'cn must stay a function, not a component')

// A default + named import from the same path needs both.
const card = shimModule(SOURCE, 'components/ui/card')
assert.match(card, /export const CardHeader =/)
assert.match(card, /export default/, 'a default import must get a default export')

// Every shim is served as a module, so a syntax error only shows up inside the preview window
// where nobody can see it. vm has no ESM parser without a flag, so strip the module keywords.
// The last path is one nobody imported — an empty shim still has to be a valid module.
for (const path of ['components/ui/dialog', 'components/ui/card', 'lib/utils', 'nothing/here']) {
  const code = shimModule(SOURCE, path)
    .replace(/^import .*$/gm, '')
    .replace(/^export default /gm, 'const _d = ')
    .replace(/^export /gm, '')
  assert.doesNotThrow(() => new vm.Script(code), `${path} shim does not parse`)
}

// The page carries the import map and the transform; a typo there is a blank window.
const html = page()
assert.match(html, /"@\/":\s*"\.\/shim\/"/, 'the import map must route @/ to the shim route')
assert.match(html, /react\/jsx-runtime/, 'the automatic JSX runtime needs a mapping')
assert.match(html, /fetch\('\.\/src'\)/, 'the page must fetch the component source')

console.log('preview sandbox ok')

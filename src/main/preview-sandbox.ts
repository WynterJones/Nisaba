/**
 * A generated component is a single file that imports things the workspace may not have —
 * `@/components/ui/*` shadcn primitives that were never installed, icons, React itself. Rather
 * than require a whole project around it, this serves the one file on a throwaway port and
 * fills in the gaps: React and icons come from a CDN, and every unresolvable `@/…` import is
 * answered with a shim built from the exact names the file asked for. Interactive, not exact.
 *
 * ponytail: shims are guessed from the import name, so a preview shows behaviour and layout,
 * not the real shadcn styling. Point it at the workspace's own files if that stops being enough.
 */


export const CDN = 'https://esm.sh'

/** Bare specifiers a generated component actually reaches for, mapped to a CDN build. */
const IMPORTS: Record<string, string> = {
  react: `${CDN}/react@19`,
  'react/jsx-runtime': `${CDN}/react@19/jsx-runtime`,
  'react-dom': `${CDN}/react-dom@19`,
  'react-dom/client': `${CDN}/react-dom@19/client`,
  'lucide-react': `${CDN}/lucide-react?external=react`,
  clsx: `${CDN}/clsx`,
  'tailwind-merge': `${CDN}/tailwind-merge`,
  'class-variance-authority': `${CDN}/class-variance-authority`,
  'framer-motion': `${CDN}/framer-motion?external=react`,
  'motion/react': `${CDN}/framer-motion?external=react`
}

/** The tag a shimmed primitive should render, so it stays keyboard- and mouse-usable. */
const TAGS: Record<string, string> = {
  button: 'button',
  input: 'input',
  textarea: 'textarea',
  label: 'label',
  checkbox: 'input',
  switch: 'button',
  select: 'select',
  form: 'form',
  separator: 'hr',
  img: 'img',
  avatarimage: 'img',
  link: 'a'
}

/** Props that belong to a component library, not to the DOM — React warns about every one. */
const DROP = new Set([
  'asChild',
  'variant',
  'size',
  'orientation',
  'side',
  'align',
  'sideOffset',
  'inset',
  'defaultOpen',
  'onOpenChange',
  'onValueChange',
  'modal',
  'delayDuration'
])

/** Every name a file imports from `@/…`, keyed by the path it imported them from. */
function shimNames(source: string, path: string): { named: string[]; hasDefault: boolean } {
  const named = new Set<string>()
  let hasDefault = false
  // The clause must not contain a quote, or the match runs on through every earlier import
  // statement and hands this path the names belonging to the ones above it.
  const re = /import\s+([^'"]*?)\s*from\s*['"]@\/([^'"]+)['"]/g
  for (const [, clause, from] of source.matchAll(re)) {
    if (from !== path) continue
    const braces = clause.match(/\{([\s\S]*?)\}/)
    if (braces) {
      for (const part of braces[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (name) named.add(name)
      }
    }
    const bare = clause.replace(/\{[\s\S]*?\}/, '').replace(/,/g, '').trim()
    if (bare && !bare.startsWith('*')) {
      named.add(bare)
      hasDefault = true
    } else if (bare.startsWith('*')) {
      hasDefault = true
    }
  }
  return { named: [...named], hasDefault }
}

export function shimModule(source: string, path: string): string {
  const { named, hasDefault } = shimNames(source, path)
  const decl = (name: string): string => {
    const tag = TAGS[name.toLowerCase()] ?? 'div'
    // `cn` and friends are helpers, not components — a component shim would break the call.
    if (/^(cn|clsx|cx|twMerge)$/.test(name))
      return `export const ${name} = (...a) => a.flat(9).filter(x => typeof x === 'string').join(' ')`
    return `export const ${name} = make(${JSON.stringify(tag)}, ${JSON.stringify(name)})`
  }
  return [
    `import * as React from 'react'`,
    `const DROP = new Set(${JSON.stringify([...DROP])})`,
    `const make = (tag, name) => React.forwardRef((props, ref) => {`,
    `  const { children, ...rest } = props ?? {}`,
    `  const clean = Object.fromEntries(Object.entries(rest).filter(([k]) => !DROP.has(k)))`,
    // A closed dialog/popover in the real library renders nothing; keep that so previews match.
    `  if (props?.open === false) return null`,
    `  if ('open' in clean) delete clean.open`,
    `  return React.createElement(tag, { ...clean, ref, 'data-shim': name },`,
    `    tag === 'input' || tag === 'img' || tag === 'hr' ? undefined : children)`,
    `})`,
    ...named.map(decl),
    hasDefault ? `export default make('div', ${JSON.stringify(path)})` : ''
  ].join('\n')
}

export function page(): string {
  const map = JSON.stringify({ imports: { ...IMPORTS, '@/': './shim/' } })
  return `<!doctype html>
<html class="dark">
<head>
<meta charset="utf-8" />
<title>Component preview</title>
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="importmap">${map}</script>
<style>
  body { margin: 0; min-height: 100vh; background: #0b0b0e; color: #e9e9ee;
         font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
  #err { display: none; white-space: pre-wrap; padding: 20px; color: #ff9d9d;
         font-family: ui-monospace, monospace; font-size: 12px; }
</style>
</head>
<body>
<div id="root"></div>
<pre id="err"></pre>
<script type="module">
  const fail = (e) => {
    const el = document.getElementById('err')
    el.style.display = 'block'
    el.textContent = String(e?.stack ?? e)
  }
  try {
    const src = await fetch('./src').then((r) => r.text())
    const { code } = Babel.transform(src, {
      filename: 'component.tsx',
      sourceType: 'module',
      presets: [
        ['typescript', { isTSX: true, allExtensions: true }],
        ['react', { runtime: 'automatic' }]
      ]
    })
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
    const mod = await import(url)
    const C = mod.default ?? Object.values(mod).find((v) => typeof v === 'function')
    if (!C) throw new Error('This file exports no component to render.')
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    // Overlay components take their visibility from props; open them so there is something to see.
    const Harness = () => {
      const [open, setOpen] = React.useState(true)
      return React.createElement(C, { open, onOpenChange: setOpen, defaultOpen: true })
    }
    createRoot(document.getElementById('root')).render(React.createElement(Harness))
  } catch (e) {
    fail(e)
  }
  window.addEventListener('error', (e) => fail(e.error ?? e.message))
</script>
</body>
</html>`
}


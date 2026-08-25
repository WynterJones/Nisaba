import { useEffect, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { cn } from '@/lib/utils'

/**
 * Nisaba's own palette rather than an off-the-shelf theme, so a code panel sits in the app
 * instead of next to it. The background stays transparent: the surface it lands on owns that.
 */
const theme = EditorView.theme(
  {
    // Without an explicit height the editor grows to fit its content and the panel around it
    // never scrolls — the single most common way a CodeMirror view looks broken.
    '&': {
      height: '100%',
      color: 'var(--foreground)',
      backgroundColor: 'transparent',
      fontSize: '11px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
    },
    '.cm-content': { padding: '12px 0', caretColor: 'var(--brand-bright)' },
    // Horizontal padding lives on the line, so text is inset with or without a gutter.
    '.cm-line': { padding: '0 12px' },
    '.cm-scroller': { lineHeight: '1.7', overflow: 'auto' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'color-mix(in oklab, var(--muted-foreground) 45%, transparent)',
      border: 'none',
      paddingRight: '10px'
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 0 0 12px', minWidth: '2.5em' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in oklab, var(--brand) 35%, transparent)'
    },
    '&.cm-focused': { outline: 'none' }
  },
  { dark: true }
)

const highlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'oklch(0.52 0.01 285)', fontStyle: 'italic' },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: 'oklch(0.72 0.16 300)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'oklch(0.78 0.13 145)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'oklch(0.80 0.12 60)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'oklch(0.82 0.11 200)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'oklch(0.80 0.11 250)' },
  { tag: [t.propertyName, t.attributeName], color: 'oklch(0.80 0.09 250)' },
  { tag: [t.tagName, t.angleBracket], color: 'oklch(0.74 0.15 20)' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: 'oklch(0.66 0.008 285)' },
  { tag: [t.variableName, t.definition(t.variableName)], color: 'var(--foreground)' },
  { tag: [t.heading, t.strong], color: 'oklch(0.88 0.06 297)', fontWeight: '600' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.link, t.url], color: 'oklch(0.74 0.14 250)', textDecoration: 'underline' },
  { tag: [t.invalid], color: 'var(--destructive)' }
])

/** Extension guesses beat a `language` prop nobody remembers to pass. */
function languageFor(name: string): Extension[] {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx', 'jsx', 'mts', 'cts'].includes(ext)) {
    return [javascript({ typescript: ext.startsWith('t'), jsx: ext.endsWith('x') })]
  }
  if (['js', 'mjs', 'cjs'].includes(ext)) return [javascript()]
  if (['html', 'htm', 'vue', 'astro', 'svelte'].includes(ext)) return [html()]
  if (['css', 'scss', 'less', 'pcss'].includes(ext)) return [css()]
  if (['json', 'jsonc'].includes(ext)) return [json()]
  if (['md', 'mdx', 'markdown', 'txt'].includes(ext)) return [markdown()]
  return []
}

/**
 * Read-only source display. One component for every place Nisaba shows code, so highlighting,
 * theme and line numbers stay identical whether it is a generated component, extracted CSS or
 * a DESIGN.md.
 *
 * `filename` drives the language — pass a bare extension (`"css"`) when there is no real file.
 */
export function CodeView({
  value,
  filename = '',
  numbered = true,
  wrap = false,
  className
}: {
  value: string
  filename?: string
  numbered?: boolean
  wrap?: boolean
  className?: string
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          theme,
          syntaxHighlighting(highlight),
          ...languageFor(filename),
          ...(numbered ? [lineNumbers()] : []),
          ...(wrap ? [EditorView.lineWrapping] : []),
          EditorState.readOnly.of(true),
          // Read-only still leaves a blinking caret and a focusable surface; this is a view.
          EditorView.editable.of(false)
        ]
      })
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
    // The language and gutter are baked into the state, so a change there needs a fresh editor.
  }, [filename, numbered, wrap])

  // Content changes are a transaction, not a rebuild — switching files keeps the scroll smooth.
  useEffect(() => {
    const editor = view.current
    if (!editor || editor.state.doc.toString() === value) return
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }, [value])

  return <div ref={host} className={cn('h-full min-h-0 overflow-hidden', className)} />
}

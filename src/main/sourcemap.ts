import { ipcMain } from 'electron'
import { readFile, readdir, stat } from 'fs/promises'
import { extname, join, relative } from 'path'

export type Needle = { value: string; kind: 'testid' | 'id' | 'text' | 'class' | 'aria' }

export type SourceMatch = {
  file: string
  line: number
  needle: string
  kind: Needle['kind']
  /** 0..1 — how much the match is worth trusting. */
  confidence: number
  snippet: string
}

const SEARCHABLE = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.vue', '.svelte', '.astro',
  '.html', '.htm', '.hbs', '.ejs', '.pug', '.twig', '.liquid',
  '.php', '.erb', '.rb', '.blade',
  '.css', '.scss', '.sass', '.less',
  '.md', '.mdx', '.json', '.yml', '.yaml'
])

const SKIP = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.astro', '.turbo', '.cache',
  'dist', 'build', 'out', 'coverage', 'vendor', 'target', '.venv', '__pycache__',
  '.nisaba', 'public/assets'
])

const MAX_FILES = 4000
const MAX_BYTES = 512 * 1024

/** A testid is designed to be unique; a utility class barely narrows anything. */
const WEIGHT: Record<Needle['kind'], number> = {
  testid: 1,
  id: 0.85,
  aria: 0.75,
  text: 0.7,
  class: 0.5
}

async function walk(root: string): Promise<string[]> {
  const files: string[] = []
  const queue = [root]

  while (queue.length && files.length < MAX_FILES) {
    const dir = queue.shift()!
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (files.length >= MAX_FILES) break
      if (SKIP.has(entry.name) || (entry.name.startsWith('.') && entry.name !== '.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) queue.push(full)
      else if (SEARCHABLE.has(extname(entry.name))) files.push(full)
    }
  }
  return files
}

/**
 * Greps a workspace for the distinctive strings an element carries, so a redline task can
 * name the file that probably renders it. This is a hint with evidence attached, never a
 * claim — the exported plan tells the agent to verify before editing.
 */
export async function locate(root: string, needles: Needle[]): Promise<SourceMatch[]> {
  if (needles.length === 0) return []
  const files = await walk(root)
  const matches: SourceMatch[] = []

  for (const file of files) {
    const info = await stat(file).catch(() => null)
    if (!info || info.size > MAX_BYTES) continue
    const body = await readFile(file, 'utf8').catch(() => null)
    if (!body) continue

    for (const needle of needles) {
      const at = body.indexOf(needle.value)
      if (at === -1) continue

      const line = body.slice(0, at).split('\n').length
      const raw = body.split('\n')[line - 1] ?? ''
      // A hit in a file that mentions the needle once is stronger than one that repeats it.
      const occurrences = body.split(needle.value).length - 1
      const confidence = Math.max(0.15, WEIGHT[needle.kind] / Math.min(occurrences, 6))

      matches.push({
        file: relative(root, file),
        line,
        needle: needle.value,
        kind: needle.kind,
        confidence: Number(confidence.toFixed(2)),
        snippet: raw.trim().slice(0, 160)
      })
    }
    if (matches.length > 200) break
  }

  // Best hit per file, strongest first.
  const best = new Map<string, SourceMatch>()
  for (const match of matches) {
    const existing = best.get(match.file)
    if (!existing || match.confidence > existing.confidence) best.set(match.file, match)
  }

  return [...best.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 5)
}

export function registerSourceMapIpc(): void {
  ipcMain.handle('sourcemap:locate', (_e, root: string, needles: Needle[]) => locate(root, needles))
}

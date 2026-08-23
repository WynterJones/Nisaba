import { app, net, protocol, shell } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile, rm } from 'fs/promises'
import { join, relative, isAbsolute } from 'path'
import { pathToFileURL } from 'url'

export type CaptureRecord = {
  id: string
  kind: 'viewport' | 'fullpage' | 'region' | 'element'
  file: string
  url: string
  title: string
  host: string
  width: number
  height: number
  createdAt: number
}

export type SectionRecord = {
  id: string
  name: string
  file: string
  url: string
  title: string
  host: string
  selector: string
  tag: string
  rect: { x: number; y: number; width: number; height: number }
  html: string
  styles: Record<string, string>
  variables: Record<string, string>
  fonts: string[]
  colors: string[]
  assets: string[]
  a11y: { role: string; name: string; headings: string[] }
  tech: { name: string; confidence: number; evidence: string }[]
  createdAt: number
}

export type LibraryIndex = {
  version: 1
  captures: CaptureRecord[]
  sections: SectionRecord[]
}

const EMPTY: LibraryIndex = { version: 1, captures: [], sections: [] }

export function libraryRoot(): string {
  return join(app.getPath('userData'), 'library')
}

function indexPath(): string {
  return join(libraryRoot(), 'index.json')
}

/**
 * ponytail: one JSON index rather than SQLite. Electron 33's Node has no built-in
 * sqlite and a native module is a build liability; swap this module's read/write for
 * real queries when the library outgrows a single file (Phase 4).
 */
let cache: LibraryIndex | null = null

export async function readIndex(): Promise<LibraryIndex> {
  if (cache) return cache
  try {
    cache = JSON.parse(await readFile(indexPath(), 'utf8')) as LibraryIndex
  } catch {
    cache = { ...EMPTY, captures: [], sections: [] }
  }
  return cache
}

async function writeIndex(next: LibraryIndex): Promise<void> {
  cache = next
  await mkdir(libraryRoot(), { recursive: true })
  const tmp = `${indexPath()}.tmp`
  await writeFile(tmp, JSON.stringify(next, null, 2))
  await rename(tmp, indexPath())
}

/** Writes a PNG into the library and returns its library-relative path. */
async function writeImage(folder: string, id: string, png: Buffer): Promise<string> {
  await mkdir(join(libraryRoot(), folder), { recursive: true })
  const rel = `${folder}/${id}.png`
  await writeFile(join(libraryRoot(), rel), png)
  return rel
}

export async function addCapture(
  png: Buffer,
  meta: Omit<CaptureRecord, 'id' | 'file' | 'createdAt'>
): Promise<CaptureRecord> {
  const id = randomUUID()
  const record: CaptureRecord = {
    ...meta,
    id,
    file: await writeImage('captures', id, png),
    createdAt: Date.now()
  }
  const index = await readIndex()
  await writeIndex({ ...index, captures: [record, ...index.captures] })
  return record
}

export async function addSection(
  png: Buffer,
  meta: Omit<SectionRecord, 'id' | 'file' | 'createdAt'>
): Promise<SectionRecord> {
  const id = randomUUID()
  const record: SectionRecord = {
    ...meta,
    id,
    file: await writeImage('sections', id, png),
    createdAt: Date.now()
  }
  const index = await readIndex()
  await writeIndex({ ...index, sections: [record, ...index.sections] })
  return record
}

export async function removeRecord(kind: 'captures' | 'sections', id: string): Promise<void> {
  const index = await readIndex()
  const record = index[kind].find((r) => r.id === id)
  if (!record) return
  await rm(join(libraryRoot(), record.file), { force: true })
  await writeIndex({ ...index, [kind]: index[kind].filter((r) => r.id !== id) } as LibraryIndex)
}

export async function revealRecord(file: string): Promise<void> {
  shell.showItemInFolder(join(libraryRoot(), file))
}

/** `nisaba://library/<relative-path>` serves images to the app renderer, and only those. */
export function registerLibraryProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'nisaba',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

export function registerLibraryProtocol(): void {
  protocol.handle('nisaba', async (request) => {
    const url = new URL(request.url)
    const root = libraryRoot()
    const target = join(root, decodeURIComponent(url.pathname))
    const rel = relative(root, target)
    // Refuse anything that escapes the library folder.
    if (rel.startsWith('..') || isAbsolute(rel)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(target).toString())
  })
}

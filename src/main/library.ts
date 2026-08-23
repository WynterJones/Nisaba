import { app, net, protocol, shell } from 'electron'
import { randomUUID } from 'crypto'
import { mkdir, writeFile, rm } from 'fs/promises'
import { join, relative, isAbsolute } from 'path'
import { pathToFileURL } from 'url'

export type Rect = { x: number; y: number; width: number; height: number }

type Base = { id: string; createdAt: number }

export type CaptureRecord = Base & {
  /** 64-bit dHash of `file`, for similarity search. */
  phash?: string | null
  kind: 'viewport' | 'fullpage' | 'region' | 'element'
  file: string
  url: string
  title: string
  host: string
  width: number
  height: number
  /** Editable vector overlay; the original PNG is never modified. */
  annotations?: Annotation[]
}

export type Annotation =
  | { id: string; type: 'rect' | 'ellipse' | 'highlight' | 'blur'; rect: Rect; color: string }
  | { id: string; type: 'arrow' | 'line'; from: { x: number; y: number }; to: { x: number; y: number }; color: string }
  | { id: string; type: 'text'; at: { x: number; y: number }; text: string; color: string }
  | { id: string; type: 'callout'; at: { x: number; y: number }; index: number; color: string }

export type SectionRecord = Base & {
  /** 64-bit dHash of `file`, for similarity search. */
  phash?: string | null
  name: string
  file: string
  url: string
  title: string
  host: string
  selector: string
  tag: string
  rect: Rect
  html: string
  styles: Record<string, string>
  variables: Record<string, string>
  fonts: string[]
  colors: string[]
  assets: string[]
  a11y: { role: string; name: string; headings: string[] }
  tech: { name: string; confidence: number; evidence: string }[]
}

export type ElementState = { state: string; file: string; styles: Record<string, string> }

export type ElementRecord = Base & {
  /** 64-bit dHash of `file`, for similarity search. */
  phash?: string | null
  category: string
  label: string
  host: string
  url: string
  selector: string
  file: string
  rect: Rect
  states: ElementState[]
  styles: Record<string, string>
  text: string
}

export type DesignSystemRecord = Base & {
  /** 64-bit dHash of `file`, for similarity search. */
  phash?: string | null
  name: string
  host: string
  url: string
  file: string
  tokens: {
    colors: { value: string; count: number; role: string; inferred: boolean }[]
    fonts: { family: string; weights: string[]; sizes: string[] }[]
    spacing: string[]
    radii: string[]
    shadows: string[]
    breakpoints: string[]
    variables: Record<string, string>
  }
  typeScale: { tag: string; size: string; weight: string; lineHeight: string; family: string }[]
  designMd: string
}

export type ResourceRecord = Base & {
  name: string
  url: string
  type: 'icons' | 'ui-kit' | 'fonts' | 'repository' | 'tool' | 'inspiration' | 'other'
  description: string
  tags: string[]
  license: string | null
}

export type WorkspaceRecord = Base & {
  name: string
  root: string
  profile: string
  agent: 'claude' | 'codex'
}

export type JobEvent = { at: number; stream: 'stdout' | 'stderr' | 'system'; text: string }

export type JobRecord = Base & {
  kind: 'component' | 'template'
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  title: string
  agent: string
  profile: string
  workspaceId: string
  sourceIds: string[]
  prompt: string
  command: string
  outputDir: string
  events: JobEvent[]
  endedAt: number | null
  error: string | null
}

export type VerificationCheck = {
  label: string
  command: string
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
  output: string
  ms: number
}

export type ComponentRecord = Base & {
  name: string
  framework: string
  workspaceId: string
  jobId: string
  dir: string
  files: string[]
  sourceIds: string[]
  verified: boolean
  /** Result of the last verification run, and whether a person overrode it. */
  checks?: VerificationCheck[]
  verifiedAt?: number | null
  overridden?: boolean
  /** Screenshot of the running preview, for comparison against the source. */
  previewShot?: string | null
}

export type TemplateRecord = ComponentRecord & { pages: string[] }

export type AuditPin = {
  id: string
  index: number
  note: string
  category:
    | 'bug'
    | 'layout'
    | 'spacing'
    | 'copy'
    | 'typography'
    | 'color'
    | 'a11y'
    | 'responsive'
    | 'content'
    | 'other'
  priority: 'high' | 'normal' | 'low'
  status: 'open' | 'done'
  selector: string
  fallbacks: string[]
  tag: string
  rect: Rect
  text: string
  html: string
  styles: Record<string, string>
  classes: string[]
  elementId: string | null
  testId: string | null
  ariaLabel: string | null
  heading: string | null
  landmark: string | null
  /** Grep hits in the workspace that probably render this element. */
  candidates: {
    file: string
    line: number
    needle: string
    kind: string
    confidence: number
    snippet: string
  }[]
  shot: string | null
}

/** A review pass over one page: the notes, where they point, and what renders them. */
export type AuditRecord = Base & {
  name: string
  url: string
  host: string
  title: string
  viewport: { width: number; height: number }
  workspaceRoot: string | null
  pins: AuditPin[]
  exportedTo: string | null
}

export type LibraryIndex = {
  version: 2
  captures: CaptureRecord[]
  sections: SectionRecord[]
  elements: ElementRecord[]
  designSystems: DesignSystemRecord[]
  resources: ResourceRecord[]
  workspaces: WorkspaceRecord[]
  jobs: JobRecord[]
  components: ComponentRecord[]
  templates: TemplateRecord[]
  audits: AuditRecord[]
}

export type Collection = Exclude<keyof LibraryIndex, 'version'>

const EMPTY = (): LibraryIndex => ({
  version: 2,
  captures: [],
  sections: [],
  elements: [],
  designSystems: [],
  resources: [],
  workspaces: [],
  jobs: [],
  components: [],
  templates: [],
  audits: []
})

export function libraryRoot(): string {
  return join(app.getPath('userData'), 'library')
}

function indexPath(): string {
  return join(libraryRoot(), 'index.json')
}

/** Storage lives in SQLite now; this module keeps the record types and file helpers. */
export async function readIndex(): Promise<LibraryIndex> {
  const { readAll } = await import('./db')
  return readAll()
}

export async function addRecord<K extends Collection>(
  kind: K,
  record: LibraryIndex[K][number]
): Promise<LibraryIndex[K][number]> {
  const { put } = await import('./db')
  put(kind, record as never)
  return record
}

export async function patchRecord<K extends Collection>(
  kind: K,
  id: string,
  patch: Partial<LibraryIndex[K][number]>
): Promise<void> {
  const { get, put } = await import('./db')
  const existing = get(kind, id)
  if (!existing) return
  put(kind, { ...existing, ...patch } as never)
}

export async function removeRecord(kind: Collection, id: string): Promise<void> {
  const { remove } = await import('./db')
  const record = remove(kind, id) as { file?: string } | null
  if (record?.file) await rm(join(libraryRoot(), record.file), { force: true })
}

export function newId(): string {
  return randomUUID()
}

/** Writes a PNG into the library and returns its library-relative path. */
export async function writeImage(folder: string, id: string, png: Buffer): Promise<string> {
  await mkdir(join(libraryRoot(), folder), { recursive: true })
  const rel = `${folder}/${id}.png`
  await writeFile(join(libraryRoot(), rel), png)
  return rel
}

/** Perceptual hash, stored on the record so similarity search never re-reads the file. */
export async function hashImage(png: Buffer): Promise<string | null> {
  const { hashBuffer } = await import('./similarity')
  return hashBuffer(png)
}

export async function writeText(folder: string, name: string, body: string): Promise<string> {
  await mkdir(join(libraryRoot(), folder), { recursive: true })
  const rel = `${folder}/${name}`
  await writeFile(join(libraryRoot(), rel), body)
  return rel
}

export async function revealRecord(file: string): Promise<void> {
  shell.showItemInFolder(join(libraryRoot(), file))
}

/** `nisaba://library/<relative-path>` serves assets to the app renderer, and only those. */
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

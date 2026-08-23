import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync, readFileSync, renameSync } from 'fs'
import { join } from 'path'
import type { Collection, LibraryIndex } from './library'

/**
 * SQLite via Node's built-in driver — no native module to rebuild per platform.
 * Records keep their JSON shape in `data`; the columns beside it exist so the things we
 * actually filter and sort by are indexed rather than scanned.
 */
let db: DatabaseSync | null = null

export const COLLECTIONS: Collection[] = [
  'captures',
  'sections',
  'elements',
  'designSystems',
  'resources',
  'workspaces',
  'jobs',
  'components',
  'templates',
  'audits'
]

function libraryDir(): string {
  return join(app.getPath('userData'), 'library')
}

export function open(): DatabaseSync {
  if (db) return db
  mkdirSync(libraryDir(), { recursive: true })
  const handle = new DatabaseSync(join(libraryDir(), 'library.db'))

  handle.exec('PRAGMA journal_mode = WAL')
  handle.exec('PRAGMA foreign_keys = ON')
  handle.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id          TEXT NOT NULL,
      collection  TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      host        TEXT,
      name        TEXT,
      /** 64-bit perceptual hash as a hex string, for similarity search. */
      phash       TEXT,
      data        TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS records_collection_created
      ON records (collection, created_at DESC);
    CREATE INDEX IF NOT EXISTS records_host ON records (collection, host);
    CREATE INDEX IF NOT EXISTS records_phash ON records (phash) WHERE phash IS NOT NULL;

    CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(
      id UNINDEXED, collection UNINDEXED, body, tokenize = 'porter'
    );
  `)

  db = handle
  migrateFromJson(handle)
  return handle
}

/** Text an artifact should be findable by. */
function searchBody(record: Record<string, unknown>): string {
  const parts: string[] = []
  const push = (value: unknown): void => {
    if (typeof value === 'string' && value.length < 4000) parts.push(value)
  }
  for (const key of ['name', 'title', 'host', 'url', 'selector', 'label', 'text', 'category', 'framework', 'description']) {
    push(record[key])
  }
  if (Array.isArray(record.tags)) parts.push(record.tags.join(' '))
  if (Array.isArray(record.fonts)) parts.push((record.fonts as string[]).join(' '))
  if (Array.isArray(record.tech)) {
    parts.push((record.tech as { name: string }[]).map((t) => t.name).join(' '))
  }
  if (Array.isArray(record.pins)) {
    parts.push((record.pins as { note: string }[]).map((p) => p.note).join(' '))
  }
  return parts.join(' ').slice(0, 8000)
}

type AnyRecord = { id: string; createdAt: number } & Record<string, unknown>

export function put(collection: Collection, record: AnyRecord): void {
  const handle = open()
  handle
    .prepare(
      `INSERT INTO records (id, collection, created_at, host, name, phash, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(collection, id) DO UPDATE SET
         created_at = excluded.created_at, host = excluded.host,
         name = excluded.name, phash = excluded.phash, data = excluded.data`
    )
    .run(
      record.id,
      collection,
      record.createdAt,
      (record.host as string) ?? null,
      (record.name as string) ?? (record.title as string) ?? null,
      (record.phash as string) ?? null,
      JSON.stringify(record)
    )

  handle.prepare('DELETE FROM search WHERE id = ? AND collection = ?').run(record.id, collection)
  handle
    .prepare('INSERT INTO search (id, collection, body) VALUES (?, ?, ?)')
    .run(record.id, collection, searchBody(record))
}

export function remove(collection: Collection, id: string): AnyRecord | null {
  const handle = open()
  const row = handle
    .prepare('SELECT data FROM records WHERE collection = ? AND id = ?')
    .get(collection, id) as { data: string } | undefined
  handle.prepare('DELETE FROM records WHERE collection = ? AND id = ?').run(collection, id)
  handle.prepare('DELETE FROM search WHERE collection = ? AND id = ?').run(collection, id)
  return row ? (JSON.parse(row.data) as AnyRecord) : null
}

export function all(collection: Collection): AnyRecord[] {
  const rows = open()
    .prepare('SELECT data FROM records WHERE collection = ? ORDER BY created_at DESC')
    .all(collection) as { data: string }[]
  return rows.map((r) => JSON.parse(r.data) as AnyRecord)
}

export function get(collection: Collection, id: string): AnyRecord | null {
  const row = open()
    .prepare('SELECT data FROM records WHERE collection = ? AND id = ?')
    .get(collection, id) as { data: string } | undefined
  return row ? (JSON.parse(row.data) as AnyRecord) : null
}

export function readAll(): LibraryIndex {
  const index = { version: 2 } as LibraryIndex
  for (const collection of COLLECTIONS) {
    ;(index as unknown as Record<string, unknown>)[collection] = all(collection)
  }
  return index
}

export function counts(): Record<string, number> {
  const rows = open()
    .prepare('SELECT collection, COUNT(*) AS n FROM records GROUP BY collection')
    .all() as { collection: string; n: number }[]
  return Object.fromEntries(rows.map((r) => [r.collection, r.n]))
}

/** Full-text search across every collection, or one of them. */
export function search(query: string, collection?: Collection): AnyRecord[] {
  if (!query.trim()) return []
  const handle = open()
  // FTS5 treats punctuation as syntax; quote each term so user input can't be a query.
  const safe = query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '')}"*`)
    .join(' ')

  const sql = `SELECT r.data FROM search s
               JOIN records r ON r.id = s.id AND r.collection = s.collection
               WHERE search MATCH ? ${collection ? 'AND s.collection = ?' : ''}
               ORDER BY bm25(search) LIMIT 200`
  const rows = (
    collection ? handle.prepare(sql).all(safe, collection) : handle.prepare(sql).all(safe)
  ) as { data: string }[]
  return rows.map((r) => JSON.parse(r.data) as AnyRecord)
}

/** Everything carrying a perceptual hash, for similarity ranking. */
export function hashed(): { id: string; collection: string; phash: string; data: string }[] {
  return open()
    .prepare('SELECT id, collection, phash, data FROM records WHERE phash IS NOT NULL')
    .all() as { id: string; collection: string; phash: string; data: string }[]
}

/**
 * One-time move from the JSON index. The old file is renamed rather than deleted so a
 * bad migration is recoverable.
 */
function migrateFromJson(handle: DatabaseSync): void {
  const jsonPath = join(libraryDir(), 'index.json')
  if (!existsSync(jsonPath)) return

  const already = handle.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }
  if (already.n > 0) {
    renameSync(jsonPath, `${jsonPath}.migrated`)
    return
  }

  try {
    const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as Record<string, unknown>
    let moved = 0
    for (const collection of COLLECTIONS) {
      // Pre-rename libraries called audits "redlines".
      const rows = (parsed[collection] ?? (collection === 'audits' ? parsed.redlines : null)) as
        | AnyRecord[]
        | undefined
      if (!Array.isArray(rows)) continue
      for (const record of rows) {
        if (record?.id) {
          put(collection, record)
          moved++
        }
      }
    }
    renameSync(jsonPath, `${jsonPath}.migrated`)
    console.log(`[library] migrated ${moved} records from index.json to SQLite`)
  } catch (error) {
    console.error('[library] migration failed, leaving index.json in place', error)
  }
}

export function close(): void {
  db?.close()
  db = null
}

import { ipcMain, nativeImage } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { libraryRoot, type Collection } from './library'

const SIZE = 9 // dHash compares each pixel with its right neighbour, so width is size-1

/**
 * A 64-bit difference hash. Two images that look alike keep most of those bits in common
 * even after rescaling or recompression, which is what makes near-duplicate detection work.
 */
export function hashBuffer(png: Buffer): string | null {
  const image = nativeImage.createFromBuffer(png)
  if (image.isEmpty()) return null

  const small = image.resize({ width: SIZE, height: SIZE, quality: 'good' })
  const bitmap = small.toBitmap() // BGRA
  const { width, height } = small.getSize()
  if (width < 2 || height < 1) return null

  const grey: number[] = []
  for (let i = 0; i < bitmap.length; i += 4) {
    grey.push(0.114 * bitmap[i] + 0.587 * bitmap[i + 1] + 0.299 * bitmap[i + 2])
  }

  let bits = ''
  for (let y = 0; y < Math.min(height, SIZE - 1); y++) {
    for (let x = 0; x < width - 1; x++) {
      bits += grey[y * width + x] > grey[y * width + x + 1] ? '1' : '0'
    }
  }

  // Pack to hex so it stores and compares cheaply.
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16)
  }
  return hex
}

export async function hashFile(relativePath: string): Promise<string | null> {
  const png = await readFile(join(libraryRoot(), relativePath)).catch(() => null)
  return png ? hashBuffer(png) : null
}

const POPCOUNT = Array.from({ length: 16 }, (_, i) => i.toString(2).split('1').length - 1)

/** Hamming distance between two hex hashes — lower means more alike. */
export function distance(a: string, b: string): number {
  const len = Math.min(a.length, b.length)
  let total = 0
  for (let i = 0; i < len; i++) {
    total += POPCOUNT[parseInt(a[i], 16) ^ parseInt(b[i], 16)]
  }
  total += Math.abs(a.length - b.length) * 4
  return total
}

export type SimilarHit = {
  id: string
  collection: Collection
  distance: number
  /** 0..1, where 1 is an exact match of the hash. */
  score: number
  record: Record<string, unknown>
}

export function registerSimilarityIpc(): void {
  /** Fills in hashes for anything saved before hashing existed. */
  ipcMain.handle('similar:index', async (): Promise<number> => {
    const { hashed, readAll, put } = await import('./db')
    const known = new Set(hashed().map((r) => `${r.collection}:${r.id}`))
    const index = readAll() as unknown as Record<string, { id: string; file?: string }[]>

    let added = 0
    for (const collection of ['captures', 'sections', 'elements', 'designSystems'] as const) {
      for (const record of index[collection] ?? []) {
        if (!record.file || known.has(`${collection}:${record.id}`)) continue
        const phash = await hashFile(record.file)
        if (!phash) continue
        put(collection, { ...record, phash } as never)
        added++
      }
    }
    return added
  })

  ipcMain.handle(
    'similar:find',
    async (
      _e,
      input: { collection: Collection; id: string; limit?: number }
    ): Promise<SimilarHit[]> => {
      const { hashed, get } = await import('./db')
      const source = get(input.collection, input.id) as { phash?: string; file?: string } | null
      if (!source) return []

      const phash = source.phash ?? (source.file ? await hashFile(source.file) : null)
      if (!phash) return []

      return hashed()
        .filter((row) => !(row.collection === input.collection && row.id === input.id))
        .map((row) => {
          const d = distance(phash, row.phash)
          return {
            id: row.id,
            collection: row.collection as Collection,
            distance: d,
            score: Math.max(0, 1 - d / 64),
            record: JSON.parse(row.data) as Record<string, unknown>
          }
        })
        .filter((hit) => hit.distance <= 22)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, input.limit ?? 12)
    }
  )

  /** Pairs close enough to be the same thing captured twice. */
  ipcMain.handle('similar:duplicates', async (): Promise<[SimilarHit, SimilarHit][]> => {
    const { hashed } = await import('./db')
    const rows = hashed()
    const pairs: [SimilarHit, SimilarHit][] = []

    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const d = distance(rows[i].phash, rows[j].phash)
        if (d > 6) continue
        const toHit = (row: (typeof rows)[number]): SimilarHit => ({
          id: row.id,
          collection: row.collection as Collection,
          distance: d,
          score: Math.max(0, 1 - d / 64),
          record: JSON.parse(row.data) as Record<string, unknown>
        })
        pairs.push([toHit(rows[i]), toHit(rows[j])])
        if (pairs.length >= 60) return pairs
      }
    }
    return pairs
  })
}

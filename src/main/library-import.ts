import { mkdir, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { libraryRoot, readIndex, type LibraryIndex } from './library'

/** Replaces the whole index in one atomic write, then drops the module cache. */
export async function writeImported(next: LibraryIndex): Promise<void> {
  await mkdir(libraryRoot(), { recursive: true })
  const path = join(libraryRoot(), 'index.json')
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(next, null, 2))
  await rename(tmp, path)
  // Force the next read to come from disk.
  const mod = (await import('./library')) as unknown as { __resetCache?: () => void }
  mod.__resetCache?.()
  await readIndex()
}

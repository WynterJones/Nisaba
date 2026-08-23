import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { libraryRoot, readIndex, type LibraryIndex } from './library'

/**
 * Exports a portable folder rather than a zip — no archive dependency, and the result is
 * directly inspectable. Import reads the same shape back.
 */
async function writePackage(dest: string, index: LibraryIndex, ids: string[] | null): Promise<number> {
  const pick = <T extends { id: string }>(rows: T[]): T[] =>
    ids ? rows.filter((r) => ids.includes(r.id)) : rows

  const bundle = {
    format: 'nisaba-library',
    version: 1,
    exportedAt: new Date().toISOString(),
    captures: pick(index.captures),
    sections: pick(index.sections),
    elements: pick(index.elements),
    designSystems: pick(index.designSystems),
    resources: pick(index.resources),
    components: pick(index.components),
    templates: pick(index.templates)
  }

  await mkdir(join(dest, 'files'), { recursive: true })
  let copied = 0
  const withFiles = [
    ...bundle.captures,
    ...bundle.sections,
    ...bundle.elements,
    ...bundle.designSystems
  ] as { file?: string }[]

  for (const record of withFiles) {
    if (!record.file) continue
    const target = join(dest, 'files', record.file)
    await mkdir(join(target, '..'), { recursive: true })
    await copyFile(join(libraryRoot(), record.file), target).then(
      () => copied++,
      () => undefined
    )
  }

  await writeFile(join(dest, 'library.json'), JSON.stringify(bundle, null, 2))
  await writeFile(
    join(dest, 'README.md'),
    [
      '# Nisaba library export',
      '',
      `Exported ${bundle.exportedAt}.`,
      '',
      '- `library.json` — every record, with its full provenance',
      '- `files/` — the screenshots those records point at, under their original relative paths',
      '',
      'Import this folder back into Nisaba from Settings to restore the records and their',
      'relationships. IDs are preserved, so re-importing updates rather than duplicates.'
    ].join('\n')
  )
  return copied
}

export function registerExportIpc(): void {
  ipcMain.handle('library:export', async (e, ids: string[] | null) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export library',
      defaultPath: `nisaba-library-${new Date().toISOString().slice(0, 10)}`,
      buttonLabel: 'Export'
    })
    if (result.canceled || !result.filePath) return null

    const index = await readIndex()
    const copied = await writePackage(result.filePath, index, ids)
    shell.showItemInFolder(result.filePath)
    return { path: result.filePath, files: copied }
  })

  ipcMain.handle('library:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose an exported Nisaba library folder',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null

    const dir = result.filePaths[0]
    const raw = await readFile(join(dir, 'library.json'), 'utf8').catch(() => null)
    if (!raw) throw new Error('That folder has no library.json')
    const bundle = JSON.parse(raw) as Partial<LibraryIndex> & { format?: string }
    if (bundle.format !== 'nisaba-library') throw new Error('That is not a Nisaba export')

    const index = await readIndex()
    const merge = <T extends { id: string }>(existing: T[], incoming: T[] = []): T[] => {
      const byId = new Map(existing.map((r) => [r.id, r]))
      for (const record of incoming) byId.set(record.id, record)
      return [...byId.values()].sort(
        (a, b) => ((b as { createdAt?: number }).createdAt ?? 0) - ((a as { createdAt?: number }).createdAt ?? 0)
      )
    }

    const next: LibraryIndex = {
      ...index,
      captures: merge(index.captures, bundle.captures),
      sections: merge(index.sections, bundle.sections),
      elements: merge(index.elements, bundle.elements),
      designSystems: merge(index.designSystems, bundle.designSystems),
      resources: merge(index.resources, bundle.resources),
      components: merge(index.components, bundle.components),
      templates: merge(index.templates, bundle.templates)
    }

    // Copy the referenced images back into the library so previews resolve.
    let restored = 0
    const withFiles = [
      ...(bundle.captures ?? []),
      ...(bundle.sections ?? []),
      ...(bundle.elements ?? []),
      ...(bundle.designSystems ?? [])
    ] as { file?: string }[]
    for (const record of withFiles) {
      if (!record.file) continue
      const target = join(libraryRoot(), record.file)
      await mkdir(join(target, '..'), { recursive: true })
      await copyFile(join(dir, 'files', record.file), target).then(
        () => restored++,
        () => undefined
      )
    }

    const { put } = await import('./db')
    for (const collection of [
      'captures', 'sections', 'elements', 'designSystems',
      'resources', 'components', 'templates'
    ] as const) {
      for (const record of next[collection]) put(collection, record as never)
    }
    return { records: withFiles.length, files: restored }
  })
}

import { ipcMain } from 'electron'
import { activeView } from './browser'
import { captureRect, capturePageShot, pageMeta } from './capture'
import { addRecord, hashImage, isPageSource, newId, writeImage, type SectionRecord } from './library'
import { CANCEL_SCRIPT, PAGE_SCRIPT, SELECTOR_SCRIPT } from './extract-scripts'

export type SectionDraft = Omit<SectionRecord, 'id' | 'file' | 'createdAt'> & {
  preview: string
  rect: { x: number; y: number; width: number; height: number }
}

export function registerExtractIpc(): void {
  ipcMain.handle('extract:select', async (): Promise<SectionDraft | null> => {
    const view = activeView()
    if (!view) throw new Error('Open a page before extracting')

    const picked = (await view.webContents.executeJavaScript(SELECTOR_SCRIPT, true)) as Omit<
      SectionDraft,
      'preview' | 'url' | 'title' | 'host' | 'name'
    > | null
    if (!picked) return null

    const png = await captureRect(picked.rect)
    const page = pageMeta(view)

    return {
      ...picked,
      ...page,
      name: `${page.host} — ${picked.tag}`,
      preview: png ? `data:image/png;base64,${png.toString('base64')}` : ''
    }
  })

  /**
   * The whole page as one template source. Same shape as a section — so the whole convert
   * pipeline works on it unchanged — but rooted at `<body>` and shot beyond the viewport.
   */
  ipcMain.handle('extract:page', async (): Promise<SectionDraft | null> => {
    const view = activeView()
    if (!view) throw new Error('Open a page before capturing it')

    const picked = (await view.webContents.executeJavaScript(PAGE_SCRIPT, true)) as Omit<
      SectionDraft,
      'preview' | 'url' | 'title' | 'host' | 'name'
    > | null
    if (!picked) return null

    const png = await capturePageShot()
    const page = pageMeta(view)

    return {
      ...picked,
      ...page,
      name: `${page.host} — full page`,
      preview: png ? `data:image/png;base64,${png.toString('base64')}` : ''
    }
  })

  ipcMain.handle('extract:cancel', async () => {
    const view = activeView()
    if (view) await view.webContents.executeJavaScript(CANCEL_SCRIPT, true)
  })

  ipcMain.handle('extract:save', async (_e, draft: SectionDraft) => {
    // A page draft's rect is the whole document, most of which is outside the viewport.
    const png = isPageSource(draft) ? await capturePageShot() : await captureRect(draft.rect)
    if (!png) throw new Error('Could not capture the selection')
    const { preview: _preview, ...record } = draft
    const id = newId()
    return addRecord('sections', {
      ...record,
      id,
      createdAt: Date.now(),
      file: await writeImage('sections', id, png),
      phash: await hashImage(png)
    })
  })
}

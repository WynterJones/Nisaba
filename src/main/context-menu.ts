import { BrowserWindow, Menu, clipboard, dialog, nativeImage, net } from 'electron'
import { writeFile } from 'fs/promises'
import { basename, extname } from 'path'
import type { ContextMenuParams, WebContents } from 'electron'

/** Right-click has to work the same on a browsed page and on a library thumbnail. */
function ownerWindow(wc: WebContents): BrowserWindow | null {
  // A WebContentsView is not owned by a window as far as Electron is concerned, so fall back
  // to whichever window is on screen — there is only ever one.
  return BrowserWindow.fromWebContents(wc) ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

/**
 * Library grids render `?thumb`, which is both smaller and cropped to the top of a tall page.
 * Copying or saving one has to reach past it to the image the user is actually looking at.
 */
function fullSource(srcURL: string): string {
  return srcURL.startsWith('nisaba://') ? srcURL.replace(/\?thumb\b/, '') : srcURL
}

/** A sensible filename from any of the schemes an image can arrive on. */
function suggestName(srcURL: string): string {
  if (srcURL.startsWith('data:')) return 'image.png'
  try {
    const name = decodeURIComponent(basename(new URL(srcURL).pathname))
    if (name && extname(name)) return name
    if (name) return `${name}.png`
  } catch {
    /* not a URL we can parse */
  }
  return 'image.png'
}

/** The bytes behind an image, whatever scheme it came from. */
async function fetchImage(srcURL: string): Promise<Buffer | null> {
  if (srcURL.startsWith('data:')) {
    const image = nativeImage.createFromDataURL(srcURL)
    return image.isEmpty() ? null : image.toPNG()
  }
  try {
    // net.fetch speaks http(s), file: and the app's own nisaba:// scheme.
    const response = await net.fetch(srcURL)
    if (!response.ok) return null
    return Buffer.from(await response.arrayBuffer())
  } catch {
    return null
  }
}

/** Clipboard gets the full-resolution original, not whatever size the grid happened to render. */
async function copyImage(wc: WebContents, params: ContextMenuParams): Promise<void> {
  const source = fullSource(params.srcURL)
  if (source !== params.srcURL) {
    const bytes = await fetchImage(source)
    const image = bytes ? nativeImage.createFromBuffer(bytes) : null
    if (image && !image.isEmpty()) return clipboard.writeImage(image)
  }
  // Everything else: copy the bitmap Chromium already has decoded on screen.
  wc.copyImageAt(params.x, params.y)
}

async function saveImage(wc: WebContents, params: ContextMenuParams): Promise<void> {
  const win = ownerWindow(wc)
  const target = await dialog.showSaveDialog({
    title: 'Save image',
    defaultPath: suggestName(fullSource(params.srcURL)),
    buttonLabel: 'Save'
  })
  if (target.canceled || !target.filePath) return

  const bytes = await fetchImage(fullSource(params.srcURL))
  if (!bytes) {
    if (win) {
      await dialog.showMessageBox(win, {
        type: 'warning',
        message: 'Could not read that image',
        detail: 'The page may have loaded it in a way Nisaba cannot fetch again.'
      })
    }
    return
  }
  await writeFile(target.filePath, bytes)
}

/**
 * The one item browsed pages were missing. Their menu is built in `browser.ts`; this keeps the
 * fetch-and-write half in one place rather than growing a second copy of it there.
 */
export function saveImageItem(
  wc: WebContents,
  params: ContextMenuParams
): Electron.MenuItemConstructorOptions {
  return { label: 'Save Image As…', click: () => void saveImage(wc, params) }
}

/**
 * The app's own UI gets no context menu from Chromium at all, so a library thumbnail cannot be
 * copied or saved without this. Browsed pages are not touched here — they have `pageMenu`, and
 * a second listener on the same webContents would pop two menus at once.
 */
export function registerAppContextMenu(win: BrowserWindow): void {
  const wc = win.webContents
  wc.on('context-menu', (_e, params) => {
    const items: Electron.MenuItemConstructorOptions[] = []

    if (params.mediaType === 'image' && params.srcURL) {
      items.push(
        { label: 'Copy Image', click: () => void copyImage(wc, params) },
        saveImageItem(wc, params)
      )
    }

    if (params.isEditable) {
      if (items.length) items.push({ type: 'separator' })
      items.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { role: 'selectAll' }
      )
    } else if (params.selectionText.trim()) {
      if (items.length) items.push({ type: 'separator' })
      items.push({ role: 'copy' })
    }

    if (items.length === 0) return
    Menu.buildFromTemplate(items).popup({ window: win })
  })
}

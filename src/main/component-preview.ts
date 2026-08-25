import { ipcMain, BrowserWindow } from 'electron'
import { createServer, type Server } from 'http'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { AddressInfo } from 'net'
import { page, shimModule } from './preview-sandbox'

type Preview = { server: Server; url: string; window: BrowserWindow | null }

const running = new Map<string, Preview>()

/** Serves one component file on a free port and hands back its URL. */
async function start(id: string, dir: string, file: string): Promise<string> {
  const existing = running.get(id)
  if (existing) return existing.url

  const source = await readFile(join(dir, file), 'utf8')

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    const send = (type: string, body: string): void => {
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
      res.end(body)
    }
    if (path === '/') return send('text/html; charset=utf-8', page())
    if (path === '/src') return send('text/plain; charset=utf-8', source)
    if (path.startsWith('/shim/'))
      return send('text/javascript; charset=utf-8', shimModule(source, path.slice(6)))
    res.writeHead(404).end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const url = `http://127.0.0.1:${port}/`
  running.set(id, { server, url, window: null })
  return url
}

function open(id: string, title: string, url: string): void {
  const entry = running.get(id)
  if (entry?.window && !entry.window.isDestroyed()) {
    entry.window.focus()
    entry.window.reload()
    return
  }
  const win = new BrowserWindow({
    width: 980,
    height: 760,
    title: `${title} — preview`,
    backgroundColor: '#0b0b0e',
    webPreferences: { sandbox: true }
  })
  if (entry) entry.window = win
  win.on('closed', () => stop(id))
  void win.loadURL(url)
}

export function stop(id: string): void {
  const entry = running.get(id)
  if (!entry) return
  running.delete(id)
  entry.server.close()
  if (entry.window && !entry.window.isDestroyed()) entry.window.destroy()
}

export function stopAllComponentPreviews(): void {
  for (const id of [...running.keys()]) stop(id)
}

export function registerComponentPreviewIpc(): void {
  ipcMain.handle(
    'component:preview',
    async (_e, input: { id: string; dir: string; file: string; title: string }) => {
      const url = await start(input.id, input.dir, input.file)
      open(input.id, input.title, url)
      return url
    }
  )
  ipcMain.handle('component:preview-stop', (_e, id: string) => stop(id))
}

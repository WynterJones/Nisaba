import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

/** 1x1 transparent PNG — replaces a failed source so the browser stops drawing its own glyph. */
const BLANK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

/**
 * An <img> whose source fails paints the platform's broken-image icon, which looks like a bug
 * in the app rather than a missing file. `error` does not bubble, but it does capture — so one
 * listener here covers every image in the app: library thumbnails whose file was moved or
 * renamed on disk, and remote favicons that 404.
 */
document.addEventListener(
  'error',
  (event) => {
    const el = event.target
    if (!(el instanceof HTMLImageElement) || el.dataset.missing === 'true') return
    el.dataset.missing = 'true'
    el.src = BLANK
  },
  true
)

createRoot(document.getElementById('root')!).render(<App />)

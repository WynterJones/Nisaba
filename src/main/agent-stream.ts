/**
 * Turns an agent CLI's machine-readable event stream into lines a person can watch go by.
 * Kept free of Electron imports so `npm run check:stream` can exercise it directly.
 */

/* ------------------------------------------------------- claude stream rendering */

const DIM = '\x1b[2m'
const MAGENTA = '\x1b[35m'
const RESET = '\x1b[0m'

/** The most useful thing about a tool call is the file or command it names. */
function toolDetail(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const i = input as Record<string, unknown>
  const value = i.file_path ?? i.path ?? i.command ?? i.pattern ?? i.url ?? i.prompt
  return typeof value === 'string' ? ' ' + value.replace(/\s+/g, ' ').slice(0, 90) : ''
}

function describeEvent(event: Record<string, unknown>): string {
  const type = event.type

  if (type === 'assistant') {
    const message = event.message as { content?: unknown[] } | undefined
    let out = ''
    for (const block of message?.content ?? []) {
      const b = block as Record<string, unknown>
      if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
        out += b.text.trim().replace(/\n/g, '\r\n') + '\r\n'
      }
      if (b.type === 'tool_use') {
        out += `${MAGENTA}→ ${String(b.name)}${RESET}${DIM}${toolDetail(b.input)}${RESET}\r\n`
      }
    }
    return out
  }

  if (type === 'result') {
    // The result text is a verbatim repeat of the last assistant message, which has already
    // been printed. Only the timing is new.
    const seconds = Math.round(Number(event.duration_ms ?? 0) / 1000)
    return `${DIM}— finished in ${seconds}s${RESET}\r\n`
  }

  // Hook chatter, rate-limit notices, tool results and the init banner: all noise here.
  return ''
}

/**
 * Turns `--output-format stream-json` NDJSON into something a person can watch go by. Stateful
 * across chunks, because a PTY read can split a JSON line anywhere.
 */
export function renderClaudeStream(): (chunk: string) => string {
  let buffer = ''
  return (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    let out = ''
    for (const line of lines) {
      const text = line.trim()
      if (!text) continue
      // Startup warnings and crashes are not JSON — pass them straight through.
      if (!text.startsWith('{')) {
        out += text + '\r\n'
        continue
      }
      try {
        out += describeEvent(JSON.parse(text) as Record<string, unknown>)
      } catch {
        out += text + '\r\n'
      }
    }
    return out
  }
}

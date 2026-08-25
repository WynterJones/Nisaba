/**
 * Turning an agent's JSON into resource records. Model-written input is never trusted, so this
 * lives apart from the IPC wiring and is exercised directly by `npm run check:resources`.
 */
import type { ResourceRecord } from '../main/library'

/** The shape the agent writes back. Everything except `url` is optional. */
type Suggestion = {
  url?: string
  name?: string
  type?: ResourceRecord['type']
  description?: string
  tags?: string[]
}

export const TYPES: ResourceRecord['type'][] = [
  'icons',
  'ui-kit',
  'fonts',
  'repository',
  'tool',
  'inspiration',
  'other'
]

/**
 * Everything in `raw` that is a usable link and not already known, as library records. The
 * agent's output is model-written JSON, so nothing in it is trusted: a bad type falls back to
 * `other`, a bare host gets a scheme, an unparseable entry is dropped rather than stored.
 *
 * Pure and exported so `npm run check:resources` can exercise it without a database.
 */
export function newResources(
  raw: string,
  known: Set<string>,
  id: () => string = () => crypto.randomUUID(),
  now: () => number = Date.now
): ResourceRecord[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Mid-write, or malformed. Either way, wait for the next save.
    return []
  }
  if (!Array.isArray(parsed)) return []

  const seen = new Set(known)
  const out: ResourceRecord[] = []
  for (const entry of parsed as Suggestion[]) {
    if (!entry || typeof entry.url !== 'string' || !entry.url.trim()) continue
    // A bare host is what an agent usually writes, so it gets a scheme. Anything that already
    // names a scheme keeps it — and is then dropped unless it is http(s), rather than being
    // turned into a nonsense https:// URL by blind prefixing.
    const written = entry.url.trim()
    const scheme = /^[a-z][a-z0-9+.-]*:/i.test(written)
    let url: URL
    try {
      url = new URL(scheme ? written : `https://${written}`)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    const href = url.toString()
    if (seen.has(href)) continue
    seen.add(href)

    out.push({
      id: id(),
      createdAt: now(),
      name: (entry.name || url.hostname.replace(/^www\./, '')).slice(0, 80),
      url: href,
      type: entry.type && TYPES.includes(entry.type) ? entry.type : 'other',
      description: (entry.description ?? '').slice(0, 300),
      tags: (entry.tags ?? []).filter((t) => typeof t === 'string').slice(0, 8),
      license: null
    })
  }
  return out
}

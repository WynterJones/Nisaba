// The resource curator parses model-written JSON straight into the user's library. Everything
// that keeps a bad entry out lives in newResources. Run: npm run check:resources
import assert from 'node:assert/strict'
import { newResources } from '../src/shared/resources.ts'

const id = (): string => 'fixed-id'
const now = (): number => 1_700_000_000_000
const run = (raw: string, known: string[] = []): ReturnType<typeof newResources> =>
  newResources(raw, new Set(known), id, now)

// A bare host is what an agent usually writes; it has to become a real URL.
const [bare] = run('[{"url":"lucide.dev","type":"icons"}]')
assert.equal(bare.url, 'https://lucide.dev/')
assert.equal(bare.name, 'lucide.dev', 'a missing name falls back to the host')
assert.equal(bare.type, 'icons')

// A type the model invented must not end up stored as one.
assert.equal(run('[{"url":"a.com","type":"vibes"}]')[0].type, 'other')

// Already in the library, and twice in the same file.
assert.equal(run('[{"url":"https://lucide.dev/"}]', ['https://lucide.dev/']).length, 0)
assert.equal(run('[{"url":"a.com"},{"url":"https://a.com"}]').length, 1, 'dedupe within a batch')

// Anything that is not a usable http(s) link is dropped, never stored.
assert.equal(run('[{"url":"javascript:alert(1)"}]').length, 0, 'no javascript: urls')
assert.equal(run('[{"url":"file:///etc/passwd"}]').length, 0, 'no file: urls')
assert.equal(run('[{"name":"no url here"}]').length, 0)
assert.equal(run('[null,{"url":""},3]').length, 0)

// A half-written file must be ignored, not throw — the watcher fires mid-save.
assert.deepEqual(run('[{"url":"a.com"'), [], 'malformed JSON yields nothing')
assert.deepEqual(run('{"not":"an array"}'), [])

// Free text is clamped so one bad answer cannot bloat the library.
const long = run(`[{"url":"a.com","description":"${'x'.repeat(500)}","tags":${JSON.stringify(
  Array.from({ length: 20 }, (_, i) => `t${i}`)
)}}]`)[0]
assert.equal(long.description.length, 300)
assert.equal(long.tags.length, 8)

console.log('resource import ok')

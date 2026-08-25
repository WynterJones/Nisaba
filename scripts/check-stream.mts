// The agent stream renderer turns NDJSON into what the user watches scroll by. A regression
// here shows up as a terminal full of raw JSON, or an empty one. Run: npm run check:stream
import assert from 'node:assert/strict'
import { renderClaudeStream } from '../src/main/agent-stream.ts'

const render = renderClaudeStream()

// A chunk boundary lands mid-line — the renderer must hold the partial until the newline.
const half = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","in'
assert.equal(render(half), '', 'a partial line must not be emitted')

const rest = 'put":{"file_path":"/tmp/BRIEF.md"}}]}}\n'
const tool = render(rest)
assert.match(tool, /→ Read/, 'a tool call must be named')
assert.match(tool, /BRIEF\.md/, 'a tool call must show what it touched')

// Hook chatter, rate-limit notices and tool results are noise; they must render as nothing.
assert.equal(
  render('{"type":"system","subtype":"hook_started","hook_name":"x"}\n{"type":"rate_limit_event"}\n'),
  '',
  'noise events must be swallowed'
)

const text = render('{"type":"assistant","message":{"content":[{"type":"text","text":"Wrote it"}]}}\n')
assert.match(text, /Wrote it/, 'assistant prose must survive')

// The result event repeats the last assistant message verbatim; only the timing is new.
const done = render('{"type":"result","result":"Wrote it","duration_ms":9000}\n')
assert.doesNotMatch(done, /Wrote it/, 'the final answer must not be printed twice')
assert.match(done, /finished in 9s/, 'the run should report how long it took')

// Startup warnings from the CLI are not JSON and must pass through untouched.
assert.match(render('Permission allow rule (...): use Edit instead\n'), /Permission allow rule/)

console.log('stream renderer ok')

// Smoke check: node-pty must be built against the current Electron ABI, or every terminal
// in the app dies at require time. Run after bumping electron: npm run check:pty
const assert = require('assert')
const pty = require('node-pty')
const p = pty.spawn('/bin/sh', ['-c', 'printf "hello-pty\\n"; exit 3'], { name: 'xterm-256color', cols: 80, rows: 24 })
let out = ''
p.onData((d) => { out += d })
p.onExit(({ exitCode }) => {
  assert.ok(out.includes('hello-pty'), `no output, got: ${JSON.stringify(out)}`)
  assert.strictEqual(exitCode, 3, `exit code ${exitCode}`)
  console.log('pty ok:', JSON.stringify(out.trim()))
  process.exit(0)
})
setTimeout(() => { console.error('timeout'); process.exit(1) }, 5000)

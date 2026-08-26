// Every agent CLI must receive the prompt exactly once, in both modes — a table typo that
// dropped it would otherwise start an agent with no instructions and look like a hung run.
// Run: npm run check:agents
import assert from 'node:assert/strict'
import { AGENTS, AGENT_IDS } from '../src/shared/agents.ts'

const PROMPT = 'do the thing'

for (const id of AGENT_IDS) {
  for (const mode of ['open', 'headless'] as const) {
    const args = AGENTS[id][mode](PROMPT)
    assert.equal(
      args.filter((a) => a === PROMPT).length,
      1,
      `${id}.${mode} must pass the prompt exactly once — got ${JSON.stringify(args)}`
    )
    assert.ok(
      args.every((a) => typeof a === 'string' && a.length > 0),
      `${id}.${mode} has an empty argument`
    )
  }
}

// A yolo flag that silently does nothing is worse than none: Settings would offer a switch
// that changes no argument, so the agent still stops on every prompt.
for (const id of AGENT_IDS) {
  const safe = AGENTS[id].open(PROMPT)
  const loose = AGENTS[id].open(PROMPT, true)
  if (AGENTS[id].yolo) {
    assert.notDeepEqual(loose, safe, `${id} advertises a yolo flag but ignores it`)
    assert.equal(loose.filter((a) => a === PROMPT).length, 1, `${id} yolo dropped the prompt`)
  } else {
    assert.deepEqual(loose, safe, `${id} has no yolo flag but changed its arguments`)
  }
}

console.log(`ok — ${AGENT_IDS.length} agent CLIs invoke cleanly`)

import { ipcMain, BrowserWindow } from 'electron'
import { copyFile, mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { detectAgents, type AgentInstallation } from './agents'
import { buildInvocation } from './jobs'
import {
  libraryRoot,
  patchRecord,
  readIndex,
  writeText,
  type DesignSystemRecord
} from './library'
import { killTerminal, openTerminal, type TerminalSummary } from './terminals'
import { DEFAULT_LEVELS, mergeRefined, parseAgentAnswer, toDesignMd } from '../shared/design-spec'

/** An agent that will not finish is worse than one that fails, so it is given a hard stop. */
const TIMEOUT_MS = 12 * 60 * 1000

export type RefineState = {
  id: string
  status: 'running' | 'done' | 'failed'
  agent: AgentInstallation['id']
  dir: string
  error: string | null
}

const running = new Map<string, string>()

function broadcast(state: RefineState): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('design:refined', state)
  }
}

/* -------------------------------------------------------------------- brief */

function brief(record: DesignSystemRecord, hasEvidence: boolean): string {
  return `# Refine this design profile

Nisaba measured ${record.url} by walking the DOM and reading computed styles. The heuristics
that collapse those measurements into one primary button, one input and one card get it wrong
often: they pick a small round icon button as the primary CTA, borrow a height from an unrelated
control, or read a pill radius off something that is not a pill. Your job is to correct that.

## What you have here

- \`screenshot.png\` — the page as it was profiled. **Read this image.** It is the ground truth
  for what the components actually look like.
- \`measured.json\` — \`spec\` is Nisaba's current answer${
    hasEvidence
      ? ', and `evidence` holds every button, input, select and card it sampled, with the exact\n  computed styles of each. The right values are almost always already in `evidence` — the\n  heuristic just chose the wrong sample.'
      : '. This profile predates evidence capture, so work from the spec and the screenshot.'
  }
- The live page is at ${record.url} — fetch it if you can.

## What to produce

**Write the file \`refined.json\` in this folder** — use your file-writing tool. Printing the
JSON in your reply is not enough; Nisaba reads the file. Scratch files are fine, but
\`refined.json\` must exist and must parse.

It is JSON with the shape below, and every key is optional — omit what you cannot improve, and
Nisaba keeps its own measured value:

\`\`\`json
{
  "description": "one sentence on what this design system looks like",
  "colors": { "surface": "rgb(...)", "on-surface": "...", "primary": "...", "on-primary": "...",
              "secondary": "...", "outline": "...", "surface-container": "..." },
  "typography": { "display-lg": { "fontFamily": "...", "fontSize": "48px", "fontWeight": "700",
                                  "lineHeight": "56px", "letterSpacing": "-0.02em" },
                  "headline-lg": {}, "headline-md": {}, "title-md": {},
                  "body-md": {}, "body-sm": {}, "label-md": {} },
  "rounded": { "none": "0px", "sm": "4px", "md": "8px", "lg": "12px", "full": "9999px" },
  "spacing": { "unit": "8px", "sm": "8px", "md": "16px", "lg": "24px" },
  "components": {
    "button-primary":   { "backgroundColor": "", "textColor": "", "rounded": "", "padding": "",
                          "height": "", "shadow": "", "typography": "{typography.label-md}" },
    "button-secondary": {}, "button-tertiary": {},
    "input-field": {}, "select-field": {}, "card": {}
  }
}
\`\`\`

## Rules

1. **Observe, do not invent.** Every value must be one the page actually uses. If you cannot
   tell, leave the key out rather than guessing.
2. **Sanity-check each component against the screenshot.** A component spec is wrong if
   rendering a normal-width button with it would not look like the button in the image. The
   most common failures, in order: a \`rounded\` of \`9999px\` on a control that is a rectangle
   with soft corners; a \`height\` too small for its own \`padding\` (which squashes the label);
   a \`textColor\` that does not contrast with its \`backgroundColor\`.
3. \`padding\` is CSS shorthand (\`"12px 24px"\`). \`height\` is a single length. Colours are
   \`rgb(...)\`, \`rgba(...)\` or hex. Use \`"transparent"\` for no fill.
4. A ghost or link button has \`"backgroundColor": "transparent"\` and no \`borderColor\`. It
   still needs a \`textColor\` that is visible on the surface.
5. \`typography\` values in components are references like \`"{typography.label-md}"\` and must
   name a key you defined in \`typography\`.
6. When you are done, confirm \`refined.json\` exists and re-read it to check it parses.
`
}

/* --------------------------------------------------------------------- run */

/** Whichever agent this user actually works with: their workspace's choice, else what exists. */
async function chooseAgent(preferred?: AgentInstallation['id']): Promise<AgentInstallation> {
  const index = await readIndex()
  const want = preferred ?? index.workspaces[0]?.agent
  const installed = (await detectAgents()).filter((a) => a.path)
  const chosen = installed.find((a) => a.id === want) ?? installed[0]
  if (!chosen) {
    throw new Error('No agent CLI found — install Claude Code or Codex to refine a profile')
  }
  return chosen
}

export function registerDesignRefineIpc(): void {
  ipcMain.handle(
    'design:refine',
    async (
      _e,
      record: DesignSystemRecord,
      preferred?: AgentInstallation['id']
    ): Promise<RefineState & { terminal: TerminalSummary }> => {
      if (!record.spec) throw new Error('This profile predates the spec model — re-profile the page')
      if (running.has(record.id)) throw new Error('This profile is already being refined')

      const agent = await chooseAgent(preferred)
      const dir = join(libraryRoot(), 'design-systems', 'refine', record.id)
      await mkdir(dir, { recursive: true })

      const evidence = await readFile(
        join(libraryRoot(), 'design-systems', `${record.id}.raw.json`),
        'utf8'
      )
        .then((raw) => JSON.parse(raw) as unknown)
        .catch(() => null)

      await writeFile(
        join(dir, 'measured.json'),
        JSON.stringify({ source: record.url, spec: record.spec, evidence }, null, 2)
      )
      await copyFile(join(libraryRoot(), record.file), join(dir, 'screenshot.png')).catch(
        () => undefined
      )
      await writeFile(join(dir, 'BRIEF.md'), brief(record, Boolean(evidence)))
      // A stale answer from an earlier run must never be mistaken for this one's.
      await writeFile(join(dir, 'refined.json'), '').catch(() => undefined)

      const invocation = buildInvocation(
        agent.id,
        agent.path!,
        'Read BRIEF.md in this folder and follow it exactly. Your deliverable is the file ' +
          'refined.json, written to this folder with your file-writing tool — not a reply. ' +
          'Create it, then read it back to confirm it parses.'
      )

      const state: RefineState = { id: record.id, status: 'running', agent: agent.id, dir, error: null }

      let timer: NodeJS.Timeout | null = null
      // Agents often answer instead of writing. Keep the tail of the transcript so that answer
      // is still usable — bounded, because some of them stream a great deal of reasoning.
      let transcript = ''
      const terminal = openTerminal({
        title: `Refine · ${record.host}`,
        cwd: dir,
        file: invocation.file,
        args: invocation.args,
        display: invocation.display,
        transform: invocation.transform,
        banner:
          `\x1b[2mReading the screenshot and the measured samples with ${agent.label}. ` +
          `This usually takes a few minutes; steps appear below as it works.\x1b[0m\r\n\r\n`,
        jobId: `refine-${record.id}`,
        onData: (chunk) => {
          transcript = (transcript + chunk).slice(-200_000)
        },
        onExit: async (code) => {
          if (timer) clearTimeout(timer)
          running.delete(record.id)
          try {
            const written = await readFile(join(dir, 'refined.json'), 'utf8').catch(() => '')
            const answer = written.trim()
              ? (JSON.parse(written) as unknown)
              : parseAgentAnswer(transcript)
            if (!answer) throw new Error('no JSON in the file or the transcript')
            // Keep whatever was recovered from the transcript, so the folder always shows the
            // answer that was actually applied.
            if (!written.trim()) {
              await writeFile(join(dir, 'refined.json'), JSON.stringify(answer, null, 2))
            }
            const spec = mergeRefined(record.spec!, answer)
            const designMd = toDesignMd(
              spec,
              { url: record.url, host: record.host, capturedAt: record.createdAt },
              record.levels ?? DEFAULT_LEVELS
            )
            await writeText('design-systems', `${record.id}.md`, designMd)
            await patchRecord('designSystems', record.id, { spec, designMd, refinedAt: Date.now() })
            broadcast({ ...state, status: 'done' })
          } catch (error) {
            broadcast({
              ...state,
              status: 'failed',
              error:
                code === 0
                  ? `The agent finished but did not leave a usable refined.json (${
                      error instanceof Error ? error.message : String(error)
                    })`
                  : `The agent exited with code ${code}`
            })
          }
        }
      })

      running.set(record.id, terminal.id)
      timer = setTimeout(() => killTerminal(terminal.id), TIMEOUT_MS)

      return { ...state, terminal }
    }
  )
}

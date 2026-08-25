import { BrowserWindow, ipcMain } from 'electron'
import { watch, type FSWatcher } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { detectAgents, type AgentInstallation } from './agents'
import { addRecord, libraryRoot, readIndex } from './library'
import { TYPES, newResources } from '../shared/resources'
import { openTerminal, terminalForJob, type TerminalSummary } from './terminals'

function brief(): string {
  return `# Build the user's resource library

You are running inside Nisaba, a design-research browser. The user keeps a list of links they
build with — icon sets, UI kits, font collections, component libraries, repositories, tools and
places they go for inspiration. Your job is to grow that list with them.

## How this works

- \`resources.json\` in this folder is the live list. It is an array of objects:
  \`{ "url": "...", "name": "...", "type": "...", "description": "...", "tags": ["..."] }\`
- **Adding an entry to that file adds it to the user's library.** Nisaba watches the file and
  imports anything new within a second or two. Do not remove existing entries — the user
  deletes those in the app.
- \`type\` must be one of: ${TYPES.map((t) => `\`${t}\``).join(', ')}.
- \`description\` is one short sentence on why it is worth keeping. Keep it concrete.

## What to do

1. Read \`resources.json\` first, so you know what the user already has and do not repeat it.
2. **Ask the user what they are building** before you add anything — the stack or framework
   they work in, the visual direction they are after, what is missing from the list. One
   question at a time, and wait for the answer.
3. Go and find real links that fit. Search the web where you can. Every URL must be one you
   have reason to believe exists and is current — a dead link is worse than no link.
4. Append them to \`resources.json\` in batches as you go, so they appear in the app while you
   are still talking, and tell the user what you added.
5. Keep going until they say they have enough.

Never invent a URL to fill a gap. If you cannot find something good for a category, say so.
`
}

/** Interactive, not `--print`: the whole point is that the user talks to it. */
function invoke(agent: AgentInstallation): { file: string; args: string[]; display: string } {
  const prompt =
    'Read BRIEF.md in this folder and follow it. Start by reading resources.json, then ask ' +
    'me what I am building before you add anything.'
  const args = agent.id === 'claude' ? ['--permission-mode', 'acceptEdits', prompt] : [prompt]
  return { file: agent.path!, args, display: `${agent.id} "<resource brief>"` }
}

/** Whatever is in the file and not yet in the library, by URL. */
async function importNew(file: string): Promise<number> {
  const raw = await readFile(file, 'utf8').catch(() => '')
  if (!raw.trim()) return 0

  const known = new Set((await readIndex()).resources.map((r) => r.url))
  const fresh = newResources(raw, known)
  for (const record of fresh) await addRecord('resources', record)
  return fresh.length
}

/** One curation session at a time, addressed by this id. */
const JOB = 'curate-resources'

export function registerCuratorIpc(): void {
  ipcMain.handle('resources:curate', async (): Promise<TerminalSummary> => {
    // Starting a second session would overwrite the file the first one is still appending to.
    const live = terminalForJob(JOB)
    if (live && live.exitCode === null) return live

    const index = await readIndex()
    const want = index.workspaces[0]?.agent
    const installed = (await detectAgents()).filter((a) => a.path)
    const agent = installed.find((a) => a.id === want) ?? installed[0]
    if (!agent) {
      throw new Error('No agent CLI found — install Claude Code or Codex to build with AI')
    }

    const dir = join(libraryRoot(), 'resources', 'curate')
    await mkdir(dir, { recursive: true })
    const file = join(dir, 'resources.json')

    // Hand over the current list so the agent can see it and append to it in place.
    await writeFile(
      file,
      JSON.stringify(
        index.resources.map((r) => ({
          url: r.url,
          name: r.name,
          type: r.type,
          description: r.description,
          tags: r.tags
        })),
        null,
        2
      )
    )
    await writeFile(join(dir, 'BRIEF.md'), brief())

    const invocation = invoke(agent)
    let watcher: FSWatcher | null = null
    let pending: NodeJS.Timeout | null = null

    const terminal = openTerminal({
      title: 'Resources · Build with AI',
      cwd: dir,
      file: invocation.file,
      args: invocation.args,
      display: invocation.display,
      jobId: JOB,
      onExit: () => {
        if (pending) clearTimeout(pending)
        watcher?.close()
        watcher = null
      }
    })

    // Import as the agent writes, so links land in the library while the conversation is still
    // going. Watch the folder, not the file: a tool that saves by writing a temp file and
    // renaming it over the original would take a file watch down with the old inode.
    watcher = watch(dir, (_event, name) => {
      if (name && name !== 'resources.json') return
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        void importNew(file).then((added) => {
          if (added === 0) return
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) win.webContents.send('resources:added', added)
          }
        })
      }, 600)
    })

    return terminal
  })
}

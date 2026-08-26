import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFile, mkdir, writeFile } from 'fs/promises'
import { extname, join, relative } from 'path'
import { AGENTS, type AgentId } from './agents'
import { libraryRoot, readIndex, type AuditPin, type AuditRecord } from './library'
import { openTerminal, type TerminalSummary } from './terminals'
import { isInside } from './workspaces'

const CATEGORY_LABEL: Record<string, string> = {
  bug: 'bug',
  layout: 'layout',
  spacing: 'spacing',
  copy: 'copy',
  typography: 'typography',
  color: 'colour',
  a11y: 'accessibility',
  responsive: 'responsive',
  content: 'content',
  other: 'other'
}

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 } as const

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'task'
  )
}

/** Where a pin's picture lands in the exported folder — one name, used by every writer. */
function shotName(pin: AuditPin, i: number): string | null {
  if (!pin.shot) return null
  return `shots/${String(i + 1).padStart(2, '0')}-${slug(pin.note)}${extname(pin.shot) || '.png'}`
}

function ordered(pins: AuditPin[]): AuditPin[] {
  return [...pins].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.rect.y - b.rect.y
  )
}

function taskMarkdown(pin: AuditPin, n: number, shot: string | null): string {
  const lines: string[] = []
  const title = pin.note.split('\n')[0].trim() || `${CATEGORY_LABEL[pin.category]} issue`

  lines.push(`### ${n}. [${pin.priority} · ${CATEGORY_LABEL[pin.category]}] ${title}`)
  lines.push('')

  const rest = pin.note.split('\n').slice(1).join('\n').trim()
  if (rest) lines.push(rest, '')

  // A typed task points at no element, so every measured line below would be an empty claim.
  if (!pin.selector) {
    if (shot) lines.push(`- **Image**: \`${shot}\` — supplied by the reviewer, not captured from the page.`)
    lines.push('- **Where**: not tied to an element — read the note and find the right place.')
    lines.push('- [ ] Done')
    lines.push('')
    return lines.join('\n')
  }

  lines.push(`- **Selector**: \`${pin.selector}\``)
  if (pin.fallbacks.length) {
    lines.push(`  - if that misses: ${pin.fallbacks.map((f) => `\`${f}\``).join(', ')}`)
  }

  const described = [`\`<${pin.tag}>\``, pin.text ? `“${pin.text}”` : null]
    .filter(Boolean)
    .join(' — ')
  lines.push(`- **Element**: ${described}`)

  if (pin.landmark || pin.heading) {
    lines.push(
      `- **Where on the page**: ${[pin.heading && `under “${pin.heading}”`, pin.landmark && `inside \`${pin.landmark}\``]
        .filter(Boolean)
        .join(', ')}`
    )
  }

  if (pin.candidates.length) {
    const top = pin.candidates[0]
    lines.push(
      `- **Likely source**: \`${top.file}:${top.line}\` — matched on ${top.kind} \`${top.needle}\` (${Math.round(top.confidence * 100)}% confidence)`
    )
    if (pin.candidates.length > 1) {
      lines.push(
        `  - other candidates: ${pin.candidates
          .slice(1)
          .map((c) => `\`${c.file}:${c.line}\``)
          .join(', ')}`
      )
    }
  } else {
    lines.push('- **Likely source**: not found in the workspace — locate it by selector.')
  }

  lines.push(
    `- **Box**: ${Math.round(pin.rect.width)}×${Math.round(pin.rect.height)} at (${Math.round(pin.rect.x)}, ${Math.round(pin.rect.y)})`
  )
  if (shot) lines.push(`- **Screenshot**: \`${shot}\``)

  const styles = Object.entries(pin.styles).slice(0, 6)
  if (styles.length) {
    lines.push(`- **Computed now**: ${styles.map(([k, v]) => `\`${k}: ${v}\``).join('; ')}`)
  }

  lines.push('- [ ] Done')
  lines.push('')
  return lines.join('\n')
}

export function buildPlan(record: AuditRecord): { tasks: string; plan: string; readme: string } {
  const pins = ordered(record.pins)
  const date = new Date(record.createdAt).toISOString().slice(0, 10)
  const counts = pins.reduce<Record<string, number>>((acc, pin) => {
    acc[pin.priority] = (acc[pin.priority] ?? 0) + 1
    return acc
  }, {})

  const tasks = [
    `# ${record.name}`,
    '',
    `${pins.length} task${pins.length === 1 ? '' : 's'} audited on ${record.url} — captured ${date} at ${record.viewport.width}×${record.viewport.height}.`,
    '',
    `Priority: ${['high', 'normal', 'low']
      .filter((p) => counts[p])
      .map((p) => `${counts[p]} ${p}`)
      .join(', ')}.`,
    '',
    '## How to work this list',
    '',
    '1. Tasks are ordered by priority, then by position down the page.',
    '2. Each task names a live DOM element. **Selector** finds it in the running page;',
    '   **Likely source** is a grep-based guess at the file that renders it — open it and',
    '   confirm the element really is there before editing.',
    '3. Open the screenshot next to a task before changing anything; it is what the reviewer saw.',
    '4. A task marked *not tied to an element* was typed by hand — there is no selector to find,',
    '   only the note and any image the reviewer attached.',
    '5. Tick the checkbox when a task is done, and note anything you deliberately skipped.',
    '',
    '> The notes below were written by a person reviewing the page. Everything else — selectors,',
    '> computed styles, source guesses — was measured by Nisaba and may be stale if the page',
    '> has changed since.',
    '',
    '---',
    '',
    ...pins.map((pin, i) => taskMarkdown(pin, i + 1, shotName(pin, i)))
  ].join('\n')

  const plan = JSON.stringify(
    {
      format: 'nisaba-audit',
      version: 1,
      name: record.name,
      url: record.url,
      host: record.host,
      capturedAt: new Date(record.createdAt).toISOString(),
      viewport: record.viewport,
      workspace: record.workspaceRoot,
      tasks: pins.map((pin, i) => ({
        number: i + 1,
        note: pin.note,
        category: pin.category,
        priority: pin.priority,
        status: pin.status,
        selector: pin.selector,
        fallbackSelectors: pin.fallbacks,
        element: { tag: pin.tag, text: pin.text, classes: pin.classes, id: pin.elementId, testId: pin.testId },
        location: { heading: pin.heading, landmark: pin.landmark, rect: pin.rect },
        computedStyles: pin.styles,
        sourceCandidates: pin.candidates,
        screenshot: shotName(pin, i),
        html: pin.html
      }))
    },
    null,
    2
  )

  const readme = [
    `# ${record.name}`,
    '',
    'An audit plan exported from Nisaba.',
    '',
    '| File | What it is |',
    '| --- | --- |',
    '| `TASKS.md` | The plan, written for a person or an agent to work top to bottom |',
    '| `plan.json` | The same tasks as structured data, including each element’s HTML |',
    '| `shots/` | One screenshot per task, cropped to the element |',
    '',
    '## Handing this to an agent',
    '',
    'Point it at `TASKS.md` and let it work down the list. A prompt that works well:',
    '',
    '```',
    'Read TASKS.md and work through the tasks in order. For each one:',
    'find the element it names, make the change, tick its checkbox, and tell me',
    'what you changed. If the "Likely source" file is wrong, find the right one',
    'and say so. Stop and ask if a task is ambiguous.',
    '```',
    '',
    'The notes are a reviewer’s words. Selectors, styles and source guesses were measured',
    'from the page as it was — re-check anything that looks stale.'
  ].join('\n')

  return { tasks, plan, readme }
}

async function writePlan(dest: string, record: AuditRecord): Promise<{ path: string; tasks: number; shots: number }> {
  const { tasks, plan, readme } = buildPlan(record)
  await mkdir(join(dest, 'shots'), { recursive: true })
  await writeFile(join(dest, 'TASKS.md'), tasks)
  await writeFile(join(dest, 'plan.json'), plan)
  await writeFile(join(dest, 'README.md'), readme)

  let shots = 0
  for (const [i, pin] of ordered(record.pins).entries()) {
    if (!pin.shot) continue
    // Same name the plan already points at — the two must not drift.
    const name = shotName(pin, i)!.replace('shots/', '')
    await copyFile(join(libraryRoot(), pin.shot), join(dest, 'shots', name)).then(
      () => shots++,
      () => undefined
    )
  }
  return { path: dest, tasks: record.pins.length, shots }
}

/**
 * What the agent is told when it is handed an audit. The plan itself lives on disk — this
 * only points at it and sets the rules of engagement, so the terminal stays readable.
 */
export function implementPrompt(planDir: string, record: AuditRecord): string {
  return [
    `Work the design audit in ${planDir}.`,
    '',
    `It reviews ${record.url} and contains ${record.pins.length} task(s).`,
    'Read TASKS.md and work through the tasks in order. For each one: find the element it names,',
    'make the change in this repository, tick its checkbox in TASKS.md, and say what you changed.',
    'The screenshots in shots/ show what the reviewer saw. plan.json has the same tasks as data.',
    '',
    'If a task’s "Likely source" file is wrong, find the right one and say so. The reviewer notes',
    'are a person’s words; the selectors, styles and source guesses were measured by Nisaba and',
    'may be stale. Stop and ask if a task is ambiguous.'
  ].join('\n')
}

/**
 * The whole plan as one pasteable prompt. The terminal handoff points at a folder, which is
 * useless to an agent that cannot read the disk — this inlines TASKS.md so it works anywhere.
 */
export function clipboardPrompt(record: AuditRecord, planDir: string | null): string {
  const { tasks } = buildPlan(record)
  return [
    `Work this design audit of ${record.url} — ${record.pins.length} task(s).`,
    '',
    'Work through the tasks in order. For each one: find the element it names, make the change,',
    'and say what you changed. If a task’s "Likely source" file is wrong, find the right one and',
    'say so. The reviewer notes are a person’s words; the selectors, styles and source guesses',
    'were measured by Nisaba and may be stale. Stop and ask if a task is ambiguous.',
    record.workspaceRoot
      ? `\nThe page is served from ${record.workspaceRoot} — edit that repository; no need to hunt for it.`
      : '',
    planDir
      ? `\nThe full plan, screenshots and plan.json are on disk at ${planDir}.`
      : '',
    '',
    '---',
    '',
    tasks
  ].join('\n')
}

export function registerAuditExportIpc(): void {
  /**
   * Writes the plan into the workspace and hands it to the agent on a live terminal, so the
   * run can be watched and steered instead of disappearing into a log.
   */
  ipcMain.handle(
    'audit:implement',
    async (
      _e,
      record: AuditRecord,
      pick?: AgentId,
      yolo?: Partial<Record<AgentId, boolean>>
    ): Promise<TerminalSummary> => {
      const root = record.workspaceRoot
      if (!root) throw new Error('This audit has no workspace — set one before implementing it')

      const index = await readIndex()
      const workspace = index.workspaces.find((w) => w.root === root)
      const agent = pick ?? workspace?.agent ?? 'claude'

      const planDir = join(root, '.nisaba', 'audits', `${slug(record.name)}-${record.id.slice(0, 8)}`)
      if (!isInside(root, planDir)) throw new Error('Refusing to write outside the workspace')
      await writePlan(planDir, record)

      const prompt = implementPrompt(relative(root, planDir) || planDir, record)
      // Bare binary name: terminals.ts prepends the install locations to PATH.
      return openTerminal({
        title: `Implement · ${record.name}`,
        cwd: root,
        file: agent,
        args: AGENTS[agent].open(prompt, yolo?.[agent]),
        display: `${agent}${yolo?.[agent] ? ' (yolo)' : ''} "<audit plan>"`
      })
    }
  )

  /** The whole plan, for pasting into an agent Nisaba does not run. */
  ipcMain.handle('audit:prompt', (_e, record: AuditRecord, planDir: string | null) =>
    clipboardPrompt(record, planDir ?? null)
  )

  ipcMain.handle(
    'audit:export',
    async (e, record: AuditRecord, suggestedRoot: string | null) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const folder = `audit-${record.host.replace(/\W+/g, '-')}-${new Date(record.createdAt).toISOString().slice(0, 10)}`

      const result = await dialog.showSaveDialog(win!, {
        title: 'Export audit plan',
        defaultPath: suggestedRoot ? join(suggestedRoot, folder) : folder,
        buttonLabel: 'Export plan'
      })
      if (result.canceled || !result.filePath) return null

      const written = await writePlan(result.filePath, record)
      shell.showItemInFolder(written.path)
      return written
    }
  )
}

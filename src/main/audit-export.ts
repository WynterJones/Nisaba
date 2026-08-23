import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { copyFile, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { libraryRoot, type AuditPin, type AuditRecord } from './library'

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
    '4. Tick the checkbox when a task is done, and note anything you deliberately skipped.',
    '',
    '> The notes below were written by a person reviewing the page. Everything else — selectors,',
    '> computed styles, source guesses — was measured by Nisaba and may be stale if the page',
    '> has changed since.',
    '',
    '---',
    '',
    ...pins.map((pin, i) => taskMarkdown(pin, i + 1, pin.shot ? `shots/${String(i + 1).padStart(2, '0')}-${slug(pin.note)}.png` : null))
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
        screenshot: pin.shot ? `shots/${String(i + 1).padStart(2, '0')}-${slug(pin.note)}.png` : null,
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
    const name = `${String(i + 1).padStart(2, '0')}-${slug(pin.note)}.png`
    await copyFile(join(libraryRoot(), pin.shot), join(dest, 'shots', name)).then(
      () => shots++,
      () => undefined
    )
  }
  return { path: dest, tasks: record.pins.length, shots }
}

export function registerAuditExportIpc(): void {
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

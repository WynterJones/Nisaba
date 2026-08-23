import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import {
  ChevronDown,
  FileCode2,
  FolderOpen,
  Loader2,
  MousePointerClick,
  Save,
  Search,
  SquareDashedMousePointer,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { CATEGORIES, useAudit } from '@/audit'
import { useApp, useLibrary } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AuditPin } from '../../../../preload'

const PRIORITIES: { id: AuditPin['priority']; label: string; tint: string }[] = [
  { id: 'high', label: 'High', tint: 'bg-rose-500/15 text-rose-300 ring-rose-500/40' },
  { id: 'normal', label: 'Normal', tint: 'bg-brand/15 text-brand-bright ring-brand/40' },
  { id: 'low', label: 'Low', tint: 'bg-secondary text-muted-foreground ring-border' }
]

function PinCard({ pin }: { pin: AuditPin }): React.JSX.Element {
  const { focused, focus, update, remove, locating } = useAudit()
  const isFocused = focused === pin.id
  const ref = useRef<HTMLTextAreaElement>(null)
  const searching = locating.includes(pin.id)
  const source = pin.candidates[0]

  useEffect(() => {
    if (isFocused) ref.current?.focus()
  }, [isFocused])

  return (
    <li
      onClick={() => focus(pin.id)}
      className={cn(
        'flex cursor-text flex-col gap-2 rounded-lg border p-2.5 transition-colors',
        isFocused ? 'border-brand/60 bg-brand/5' : 'border-border hover:border-border/80'
      )}
    >
      <div className="flex items-start gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-primary-foreground">
          {pin.index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            &lt;{pin.tag}&gt; {pin.text && `“${pin.text.slice(0, 34)}”`}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            void remove(pin.id)
          }}
          title="Remove pin"
          className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {pin.shot && (
        <img
          src={window.api.library.url(pin.shot)}
          alt=""
          className="max-h-24 w-full rounded border border-border object-cover object-top"
        />
      )}

      <textarea
        ref={ref}
        value={pin.note}
        onChange={(e) => update(pin.id, { note: e.target.value })}
        placeholder="What needs fixing here?"
        rows={2}
        className="w-full resize-none rounded border border-input bg-secondary/40 p-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-bright"
      />

      <div className="flex flex-wrap items-center gap-1">
        {PRIORITIES.map((p) => (
          <button
            key={p.id}
            onClick={(e) => {
              e.stopPropagation()
              update(pin.id, { priority: p.id })
            }}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset transition-colors',
              pin.priority === p.id
                ? p.tint
                : 'text-muted-foreground ring-transparent hover:bg-accent'
            )}
          >
            {p.label}
          </button>
        ))}

        <div className="relative ml-auto">
          <select
            value={pin.category}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              update(pin.id, { category: e.target.value as AuditPin['category'] })
            }
            className="appearance-none rounded bg-secondary py-0.5 pl-1.5 pr-5 text-[10px] text-muted-foreground outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1 size-2.5 text-muted-foreground" />
        </div>
      </div>

      {searching ? (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Search className="size-2.5 animate-pulse" />
          Looking for this in your workspace…
        </p>
      ) : source ? (
        <p
          title={source.snippet}
          className="flex items-center gap-1.5 truncate text-[10px] text-emerald-400/90"
        >
          <FileCode2 className="size-2.5 shrink-0" />
          <span className="truncate font-mono">
            {source.file}:{source.line}
          </span>
          <span className="shrink-0 text-muted-foreground">
            {Math.round(source.confidence * 100)}%
          </span>
        </p>
      ) : null}
    </li>
  )
}

/** Replaces the inspector while a review is running — the notes have to live outside the page. */
export function AuditPanel(): React.JSX.Element {
  const { active, draft, stop, start, save, reset } = useAudit()
  const workspaces = useLibrary((s) => s.workspaces)
  const setOverlay = useApp((s) => s.setOverlay)
  const navigate = useNavigate()
  const pins = draft?.pins ?? []

  const finish = async (): Promise<void> => {
    await stop()
    const record = await save()
    if (record) toast.success('Review saved', { description: `${record.pins.length} tasks` })
  }

  const exportPlan = async (): Promise<void> => {
    await stop()
    const record = await save()
    if (!record) {
      toast.error('Pin something first')
      return
    }
    setOverlay(true)
    try {
      const result = await window.api.audit.export(record, record.workspaceRoot)
      if (result) {
        await window.api.library.patch('audits', record.id, { exportedTo: result.path })
        await useLibrary.getState().refresh()
        toast.success(`Exported ${result.tasks} tasks`, { description: result.path })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
    } finally {
      setOverlay(false)
    }
  }

  const unlabelled = pins.filter((p) => !p.note.trim()).length

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-sidebar">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <SquareDashedMousePointer className="size-4 text-brand-bright" />
        <span className="text-sm font-semibold">Audit</span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {pins.length}
        </span>
        {active && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-brand-bright">
            <span className="size-1.5 animate-pulse rounded-full bg-brand-bright" />
            Recording
          </span>
        )}
      </div>

      {draft && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3">
          <Input
            value={draft.name}
            onChange={(e) => useAudit.setState({ draft: { ...draft, name: e.target.value } })}
            className="h-8 text-sm"
            placeholder="Review name"
          />
          <p className="truncate text-[10px] text-muted-foreground">{draft.url}</p>
          <button
            onClick={() => navigate('/workspaces')}
            className="flex items-center gap-1.5 truncate text-left text-[10px]"
            title="Tasks are matched against this folder"
          >
            <FolderOpen className="size-2.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-mono text-muted-foreground">
              {draft.workspaceRoot ?? 'No workspace — source files will not be matched'}
            </span>
          </button>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        {pins.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="grid size-11 place-items-center rounded-xl border border-border bg-secondary/50">
              <MousePointerClick className="size-5 text-muted-foreground" />
            </span>
            <p className="max-w-[220px] text-sm text-muted-foreground">
              {active
                ? 'Click anything on the page to pin a note to it. Each pin remembers the element, its styles and where it lives in your code.'
                : 'Start a review, then click your way down the page noting everything that needs fixing.'}
            </p>
            {!active && (
              <Button size="sm" onClick={() => void start()}>
                Start review
              </Button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-2 p-3">
            {pins.map((pin) => (
              <PinCard key={pin.id} pin={pin} />
            ))}
          </ul>
        )}
      </ScrollArea>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3">
        {unlabelled > 0 && (
          <p className="text-[10px] text-amber-300/80">
            {unlabelled} pin{unlabelled === 1 ? '' : 's'} still need a note — they will export as
            untitled tasks.
          </p>
        )}
        {workspaces.length === 0 && pins.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Add a workspace to have Nisaba find the file behind each pin.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {active ? (
            <Button variant="secondary" onClick={() => void finish()}>
              <Save className="size-4" />
              Finish
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void start()}>
              <MousePointerClick className="size-4" />
              Resume
            </Button>
          )}
          <Button disabled={pins.length === 0} onClick={() => void exportPlan()}>
            <FileCode2 className="size-4" />
            Export plan
          </Button>
        </div>
        {pins.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void stop()
              reset()
            }}
            className="text-muted-foreground"
          >
            Discard review
          </Button>
        )}
      </div>
    </aside>
  )
}

export function AuditBusy(): React.JSX.Element {
  return <Loader2 className="size-4 animate-spin" />
}

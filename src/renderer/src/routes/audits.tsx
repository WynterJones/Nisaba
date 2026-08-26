import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  FileCode2,
  FolderOpen,
  MousePointerClick,
  PenLine,
  SquareTerminal,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { copyAuditPrompt, implementAudit } from '@/actions'
import { useAudit } from '@/audit'
import { AgentMenu } from '@/components/shell/agent-menu'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
import { useApp, useLibrary } from '@/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDelete } from '@/components/confirm-delete'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AuditRecord } from '../../../preload'

const PRIORITY_TINT: Record<string, string> = {
  high: 'bg-rose-500/15 text-rose-300',
  normal: 'bg-brand/15 text-brand-bright',
  low: 'bg-secondary text-muted-foreground'
}

function Detail({
  record,
  onClose,
  onContinue
}: {
  record: AuditRecord
  onClose: () => void
  onContinue: () => void
}): React.JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-hidden sm:max-w-[min(900px,92vw)]">
        <DialogHeader>
          <DialogTitle>{record.name}</DialogTitle>
          <DialogDescription>
            {record.pins.length} tasks from {record.url} · {timeAgo(record.createdAt)}
            {record.exportedTo && ` · exported to ${record.exportedTo}`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[56vh]">
          <ol className="flex flex-col gap-2 pr-3">
            {record.pins.map((pin) => (
              <li key={pin.id} className="flex gap-3 rounded-lg border border-border p-3">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-primary-foreground">
                  {pin.index}
                </span>
                {pin.shot && (
                  <img
                    src={window.api.library.url(pin.shot, true)}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded border border-border object-cover object-top"
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm">{pin.note || <em className="text-muted-foreground">No note</em>}</p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">
                    {pin.selector}
                  </p>
                  {pin.candidates[0] && (
                    <p className="truncate font-mono text-[10px] text-emerald-400/90">
                      {pin.candidates[0].file}:{pin.candidates[0].line}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge className={`text-[10px] font-normal ${PRIORITY_TINT[pin.priority]}`}>
                    {pin.priority}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{pin.category}</span>
                </div>
              </li>
            ))}
          </ol>
        </ScrollArea>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onContinue}>
            <MousePointerClick className="size-4" />
            Add more pins
          </Button>
          <AgentMenu
            disabled={!record.workspaceRoot}
            title={
              record.workspaceRoot
                ? 'Write the plan into the workspace and start an agent on it'
                : 'This audit has no workspace'
            }
            onPick={(agent) => void implementAudit(record, agent.id)}
          >
            <SquareTerminal className="size-4" />
            Implement with agent
          </AgentMenu>
          <span
            title={
              record.exportedTo
                ? 'Copy the whole plan as one prompt, for an agent outside Nisaba'
                : 'Export the plan first — the prompt points the agent at the exported folder'
            }
          >
            <Button
              variant="secondary"
              className="w-full"
              disabled={!record.exportedTo}
              onClick={() => void copyAuditPrompt(record)}
            >
              <ClipboardCopy className="size-4" />
              Copy prompt
            </Button>
          </span>
          {record.exportedTo && (
            <Button variant="secondary" onClick={() => window.api.jobs.open(record.exportedTo!)}>
              <FolderOpen className="size-4" />
              Open plan folder
            </Button>
          )}
          <Button
            onClick={async () => {
              const result = await window.api.audit.export(record, record.workspaceRoot)
              if (result) {
                await window.api.library.patch('audits', record.id, { exportedTo: result.path })
                await useLibrary.getState().refresh()
                toast.success(`Exported ${result.tasks} tasks`, {
                  description: result.path,
                  action: {
                    label: 'Copy prompt',
                    onClick: () => void copyAuditPrompt({ ...record, exportedTo: result.path })
                  }
                })
              }
            }}
          >
            <FileCode2 className="size-4" />
            {record.exportedTo ? 'Export again' : 'Export plan'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function Audits(): React.JSX.Element {
  const { audits, remove } = useLibrary()
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()
  const [open, setOpen] = useState<AuditRecord | null>(null)

  /** Reopens a saved audit in the browser panel so more pins can be added to it. */
  const resume = (record: AuditRecord): void => {
    useAudit.getState().open(record)
    newTab(record.url)
    void navigate('/browse')
  }

  return (
    <>
      <LibraryFrame
        icon={PenLine}
        title="Audits"
        items={audits}
        search={(r) => `${r.name} ${r.url} ${r.pins.map((p) => p.note).join(' ')}`}
        groupBy={{ label: 'Site', of: (r) => r.host }}
        nameOf={(r) => r.name}
        emptyTitle="No reviews yet"
        emptyBlurb="Open a page — live or localhost — hit Audit, and click your way down it noting what needs fixing. Nisaba pins each note to the element, finds the file that renders it, and exports the lot as a task plan an agent can work through."
      >
        {(rows) => (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4 p-5">
            {rows.map((record) => {
              const high = record.pins.filter((p) => p.priority === 'high').length
              const located = record.pins.filter((p) => p.candidates.length > 0).length
              return (
                <article
                  key={record.id}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand/50"
                >
                  <div className="flex items-start gap-2">
                    <button onClick={() => setOpen(record)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-medium">{record.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {record.pins.length} tasks · {timeAgo(record.createdAt)}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Add more pins to this audit"
                        onClick={() => resume(record)}
                      >
                        <MousePointerClick className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Reopen the page"
                        onClick={() => {
                          newTab(record.url)
                          void navigate('/browse')
                        }}
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                      <ConfirmDelete
                        title="Delete this review?"
                        description={`${record.name} — ${record.pins.length} task(s). Anything already exported to disk stays.`}
                        onConfirm={() => remove('audits', record.id)}
                      >
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Delete review"
                          className="hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </ConfirmDelete>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {high > 0 && (
                      <Badge className="bg-rose-500/15 text-[10px] font-normal text-rose-300">
                        {high} high
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {located}/{record.pins.length} located in code
                    </Badge>
                    {record.exportedTo && (
                      <Badge className="gap-1 bg-emerald-500/15 text-[10px] font-normal text-emerald-400">
                        <CheckCircle2 className="size-2.5" />
                        Exported
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-1">
                    {record.pins
                      .filter((p) => p.shot)
                      .slice(0, 5)
                      .map((pin) => (
                        <img
                          key={pin.id}
                          src={window.api.library.url(pin.shot!, true)}
                          alt=""
                          className="h-10 w-14 rounded border border-border object-cover object-top"
                        />
                      ))}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </LibraryFrame>

      {open && (
        <Detail
          record={open}
          onClose={() => setOpen(null)}
          onContinue={() => {
            setOpen(null)
            resume(open)
          }}
        />
      )}
    </>
  )
}

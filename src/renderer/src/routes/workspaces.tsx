import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  PenLine,
  Plus,
  ShieldCheck,
  SquareLibrary,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
import { useApp, useLibrary } from '@/store'
import { OUTPUT_PROFILES } from '@/components/shell/browser-toolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AgentId, AgentInstallation, WorkspaceProbe, WorkspaceRecord } from '../../../preload'

/** One dialog for both: with `workspace` it edits that record, without it creates a new one. */
function WorkspaceDialog({ workspace }: { workspace?: WorkspaceRecord }): React.JSX.Element {
  const refresh = useLibrary((s) => s.refresh)
  const setOverlay = useApp((s) => s.setOverlay)
  const [open, setOpen] = useState(false)
  const [root, setRoot] = useState(workspace?.root ?? '')
  const [name, setName] = useState(workspace?.name ?? '')
  const [profile, setProfile] = useState<string>(workspace?.profile ?? 'react-shadcn')
  const [agent, setAgent] = useState<AgentId>(workspace?.agent ?? 'claude')
  const [probe, setProbe] = useState<WorkspaceProbe | null>(null)
  const [agents, setAgents] = useState<AgentInstallation[]>([])
  const editing = !!workspace

  useEffect(() => {
    if (!open) return
    void window.api.agents.detect().then(setAgents)
    // Folders move and permissions change, so an existing root is re-checked every time.
    if (workspace) void window.api.workspaces.probe(workspace.root).then(setProbe)
  }, [open, workspace])

  const choose = async (): Promise<void> => {
    const picked = await window.api.workspaces.pick()
    if (!picked) return
    setRoot(picked)
    setName((current) => current || picked.split('/').filter(Boolean).pop() || 'Workspace')
    setProbe(await window.api.workspaces.probe(picked))
  }

  const submit = async (): Promise<void> => {
    try {
      if (workspace) {
        await window.api.workspaces.update(workspace.id, { name, root, profile, agent })
        await refresh()
        setOpen(false)
        toast.success('Workspace updated', { description: root })
        return
      }
      await window.api.workspaces.create({ name, root, profile, agent })
      await refresh()
      setOpen(false)
      setRoot('')
      setName('')
      setProbe(null)
      toast.success('Workspace added', { description: 'Jobs may only write inside it.' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
    }
  }

  const installed = agents.filter((a) => a.path)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setOverlay(next)
      }}
    >
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon-sm" title="Edit workspace">
            <PenLine className="size-3.5" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" />
            New workspace
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit workspace' : 'New workspace'}</DialogTitle>
          <DialogDescription>
            A workspace is a folder an agent is allowed to write into, plus the stack it should
            write in. Nothing a job does can escape this folder.
            {editing && ' Past runs stay attached to this workspace when you move it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Folder</Label>
            <div className="flex gap-2">
              <Input readOnly value={root} placeholder="No folder chosen" className="h-9 font-mono text-xs" />
              <Button variant="secondary" size="sm" className="shrink-0" onClick={choose}>
                {editing ? 'Change…' : 'Choose…'}
              </Button>
            </div>
            {probe && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {probe.writable ? (
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="size-3.5 text-destructive" />
                )}
                {probe.writable ? 'Writable' : 'Not writable'} · {probe.entries} entries
                {probe.framework && ` · ${probe.framework} detected`}
                {probe.packageManager && ` · ${probe.packageManager}`}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-name" className="text-xs text-muted-foreground">
              Name
            </Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
              placeholder="My design system"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Output profile</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {OUTPUT_PROFILES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProfile(p.id)}
                  className={`rounded-md border px-2.5 py-2 text-left text-sm transition-colors ${
                    profile === p.id
                      ? 'border-brand/60 bg-brand/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Agent</Label>
            {installed.length === 0 ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-200/90">
                No agent CLI detected. You can still create the workspace — jobs will stay disabled
                until one of Claude Code, Codex, Grok or OpenCode is installed and authenticated.
              </p>
            ) : (
              <div className="flex gap-1.5">
                {installed.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAgent(a.id)}
                    className={`flex-1 rounded-md border px-2.5 py-2 text-left text-sm transition-colors ${
                      agent === a.id
                        ? 'border-brand/60 bg-brand/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={!root || !name}>
            {editing ? 'Save changes' : 'Create workspace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Workspaces(): React.JSX.Element {
  const { workspaces, jobs, remove } = useLibrary()

  return (
    <LibraryFrame
      icon={SquareLibrary}
      title="Workspaces"
      items={workspaces}
      search={(w) => `${w.name} ${w.root} ${w.profile}`}
      nameOf={(w) => w.name}
      emptyTitle="No workspaces yet"
      emptyBlurb="Point Nisaba at a folder and it becomes the only place an agent job can write. Pick the stack it should generate in, and the CLI that will do the work."
      actions={<WorkspaceDialog />}
    >
      {(rows) => (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(21rem,1fr))] gap-4 p-5">
          {rows.map((workspace) => {
            const runs = jobs.filter((j) => j.workspaceId === workspace.id)
            return (
              <article
                key={workspace.id}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-brand/50"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{workspace.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {workspace.root}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <WorkspaceDialog workspace={workspace} />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Open folder"
                      onClick={() => window.api.workspaces.reveal(workspace.root)}
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Remove workspace"
                      className="hover:text-destructive"
                      onClick={() => void remove('workspaces', workspace.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {OUTPUT_PROFILES.find((p) => p.id === workspace.profile)?.label ??
                      workspace.profile}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {workspace.agent === 'claude' ? 'Claude Code' : 'Codex'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {runs.length} run{runs.length === 1 ? '' : 's'} · added{' '}
                    {timeAgo(workspace.createdAt)}
                  </span>
                </div>

                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                  Jobs run with this folder as their working directory and cannot write above it.
                </p>
              </article>
            )
          })}
        </div>
      )}
    </LibraryFrame>
  )
}

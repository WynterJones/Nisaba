import { useEffect, useState } from 'react'
import { create } from 'zustand'
import {
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  Compass,
  FolderOpen,
  Library,
  RefreshCw,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { refreshAgents, useAgents } from '@/agents'
import { useApp, useLibrary } from '@/store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import logo from '@/assets/logo.png'

const KEY = 'nisaba.onboarded'
/** Long enough for the splash to finish, so the two never fight over the screen. */
const AFTER_SPLASH_MS = 2700

type OnboardingState = { open: boolean; start: () => void; close: () => void }

/** Settings replays it through here; first launch opens it on its own. */
export const useOnboarding = create<OnboardingState>((set) => ({
  open: false,
  start: () => set({ open: true }),
  close: () => {
    localStorage.setItem(KEY, '1')
    set({ open: false })
  }
}))

const WHAT = [
  {
    icon: Compass,
    title: 'Browse like a browser',
    body: 'Open any site — live or your own localhost — in a real tab, at any device width.'
  },
  {
    icon: Camera,
    title: 'Capture what you like',
    body: 'Screenshot a page, extract one section, pick a single element, or profile a whole design system.'
  },
  {
    icon: Library,
    title: 'It compounds',
    body: 'Everything lands in a local library with its screenshot, source and where it came from. Nothing leaves this machine.'
  }
]

function Agents(): React.JSX.Element {
  const agents = useAgents()
  const installed = agents?.filter((a) => a.path) ?? []

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Nisaba never ships or proxies a model. It drives an agent CLI you already installed and
        signed into, on your machine, in a terminal you can watch.
      </p>

      <div className="flex flex-col gap-1.5">
        {(agents ?? []).map((agent) => (
          <div
            key={agent.id}
            className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2"
          >
            {agent.path ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="size-4 shrink-0 text-muted-foreground/60" />
            )}
            <span className="text-sm">{agent.label}</span>
            <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
              {agent.path ? (agent.version ?? 'found') : 'not installed'}
            </span>
          </div>
        ))}
        {agents === null && <p className="text-sm text-muted-foreground">Looking for CLIs…</p>}
      </div>

      {agents !== null &&
        (installed.length === 0 ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
            No agent CLI found. Browsing, capturing, extracting and the library all work without
            one — but converting a capture into code, implementing an audit, refining a design
            profile and building the resource list will stay disabled until you install and sign
            into one of the above.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Every button that hands work to an agent lets you pick which one, so you can use a
            different CLI per job.
          </p>
        ))}

      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={agents === null}
        onClick={() => void refreshAgents()}
      >
        <RefreshCw className={agents === null ? 'size-3.5 animate-spin' : 'size-3.5'} />
        Re-scan
      </Button>
    </div>
  )
}

function Workspace(): React.JSX.Element {
  const workspaces = useLibrary((s) => s.workspaces)
  const refresh = useLibrary((s) => s.refresh)
  const agents = useAgents()

  const add = async (): Promise<void> => {
    try {
      const root = await window.api.workspaces.pick()
      if (!root) return
      const name = root.split('/').filter(Boolean).pop() || 'Workspace'
      await window.api.workspaces.create({
        name,
        root,
        profile: 'react-shadcn',
        agent: agents?.find((a) => a.path)?.id ?? 'claude'
      })
      await refresh()
      toast.success('Workspace added', { description: root })
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A workspace is a folder an agent is allowed to write into — your app's repository, usually.
        Nothing a job does can escape it, and audits find the file behind an element by searching
        it. You can add more later, and change the stack each one writes in.
      </p>

      {workspaces.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {workspaces.map((w) => (
            <div
              key={w.id}
              className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2"
            >
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{w.name}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {w.root}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
          No workspace yet. Skip this if you only want to browse and capture — the library works
          without one.
        </p>
      )}

      <Button variant="secondary" size="sm" className="self-start" onClick={() => void add()}>
        <FolderOpen className="size-3.5" />
        {workspaces.length > 0 ? 'Add another folder' : 'Choose a folder…'}
      </Button>
    </div>
  )
}

/** Three steps: what this is, which agents are here, and where they may write. */
export function Onboarding(): React.JSX.Element | null {
  const { open, start, close } = useOnboarding()
  const setOverlay = useApp((s) => s.setOverlay)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (localStorage.getItem(KEY)) return
    const timer = setTimeout(start, AFTER_SPLASH_MS)
    return () => clearTimeout(timer)
  }, [start])

  // The native page view paints over all renderer HTML, so it has to go while this is up.
  useEffect(() => {
    setOverlay(open)
    if (open) setStep(0)
  }, [open, setOverlay])

  if (!open) return null

  const steps = [
    {
      title: 'Welcome to Nisaba',
      description: 'A browser that turns design research into a library you own.',
      body: (
        <div className="flex flex-col gap-3">
          {WHAT.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary">
                <Icon className="size-4 text-brand-bright" />
              </span>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      )
    },
    {
      title: 'Your AI agents',
      description: 'Which agent CLIs this machine has.',
      body: <Agents />
    },
    {
      title: 'A workspace',
      description: 'The folder agents are allowed to write into.',
      body: <Workspace />
    }
  ]
  const current = steps[step]
  const last = step === steps.length - 1

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            {step === 0 && <img src={logo} alt="" className="h-7 select-none" draggable={false} />}
            {step === 1 && <Bot className="size-5 text-brand-bright" />}
            {step === 2 && <FolderOpen className="size-5 text-brand-bright" />}
            <DialogTitle>{current.title}</DialogTitle>
          </div>
          <DialogDescription>{current.description}</DialogDescription>
        </DialogHeader>

        {current.body}

        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s.title}
                className={
                  i === step ? 'size-1.5 rounded-full bg-brand-bright' : 'size-1.5 rounded-full bg-border'
                }
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              {last ? 'Close' : 'Skip'}
            </Button>
            {!last && (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Next
                <ArrowRight className="size-3.5" />
              </Button>
            )}
            {last && (
              <Button size="sm" onClick={close}>
                Start browsing
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

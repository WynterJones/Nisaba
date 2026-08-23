import { useEffect, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  Download,
  Folder,
  Info,
  RefreshCw,
  Shield,
  ShieldCheck,
  Upload,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { useLibrary } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import wynter from '@/assets/wynter.png'
import type { AgentInstallation } from '../../../preload'

function Section({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary">
          <Icon className="size-4 text-brand-bright" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4 pl-11">{children}</div>
      <Separator />
    </section>
  )
}

export default function Settings(): React.JSX.Element {
  const [version, setVersion] = useState('')
  const [root, setRoot] = useState('')
  const [agents, setAgents] = useState<AgentInstallation[] | null>(null)
  const { captures, sections, elements, designSystems, refresh } = useLibrary()

  const exportAll = async (): Promise<void> => {
    try {
      const result = await window.api.library.export(null)
      if (result) toast.success('Library exported', { description: `${result.files} files written` })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const importFolder = async (): Promise<void> => {
    try {
      const result = await window.api.library.import()
      if (!result) return
      await refresh()
      toast.success('Library imported', {
        description: `${result.records} records, ${result.files} files restored`
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
    }
  }

  const detect = (): void => {
    setAgents(null)
    void window.api.agents.detect().then(setAgents)
  }

  useEffect(() => {
    void window.api.getVersion().then(setVersion)
    void window.api.library.root().then(setRoot)
    detect()
  }, [])

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 py-10">
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

        <Section
          icon={Folder}
          title="Library"
          description="Where captures, sections and their metadata are written. Everything stays local."
        >
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Library folder</Label>
            <div className="flex gap-2">
              <Input readOnly value={root} className="h-9 font-mono text-xs" />
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => window.api.library.reveal('index.json')}
              >
                Reveal
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {captures.length} captures · {sections.length} sections · {elements.length} elements ·{' '}
              {designSystems.length} design profiles.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Portable copy</Label>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={exportAll}>
                <Download className="size-3.5" />
                Export library
              </Button>
              <Button variant="secondary" size="sm" onClick={importFolder}>
                <Upload className="size-3.5" />
                Import
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Exports a plain folder — <code className="font-mono">library.json</code> plus the
              images it points at. IDs are preserved, so re-importing updates rather than
              duplicates.
            </p>
          </div>
        </Section>

        <Section
          icon={Bot}
          title="Agents"
          description="Nisaba drives a CLI you already installed and authenticated. It never ships a model."
        >
          {agents === null ? (
            <p className="text-sm text-muted-foreground">Checking for installed CLIs…</p>
          ) : (
            agents.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  {agent.path ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{agent.label}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {agent.path
                        ? `${agent.path}${agent.version ? ` · ${agent.version}` : ''}`
                        : 'Not detected on this machine'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
          <Button variant="secondary" size="sm" className="self-start" onClick={detect}>
            <RefreshCw className="size-3.5" />
            Re-scan
          </Button>
        </Section>

        <Section
          icon={Shield}
          title="Privacy"
          description="No account, no telemetry. Browsed pages are treated as untrusted data."
        >
          {/* These are guarantees, not preferences — a switch would imply they can be turned off. */}
          <ul className="flex flex-col gap-2.5">
            {[
              'Scripts, event handlers and entered form values are stripped from every saved HTML fragment.',
              'Browsed pages run with no Node, no preload bridge and every permission denied by default.',
              'Scraped text reaches an agent as data, inside a prompt that says so explicitly.',
              'No account, no sync, and no diagnostics are collected — there is nothing to opt out of.',
              'Nothing leaves this machine except what you send through an agent CLI you installed.'
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                {line}
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={Info} title="About" description="Nisaba — Browse. Capture. Compound.">
          <p className="text-sm text-muted-foreground">
            Version <span className="font-mono text-foreground">{version || '…'}</span>
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => window.api.browser.openExternal('https://github.com/WynterJones/Nisaba')}
          >
            View the source
          </Button>

          <div className="flex items-center gap-3 pt-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              Made by
            </span>
            <button
              onClick={() => window.api.browser.openExternal('https://wynter.ai')}
              title="wynter.ai"
              className="transition-opacity hover:opacity-80"
            >
              <img src={wynter} alt="Wynter.ai" className="h-7 select-none" draggable={false} />
            </button>
          </div>
        </Section>
      </div>
    </ScrollArea>
  )
}

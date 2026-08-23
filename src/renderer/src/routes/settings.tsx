import { useEffect, useState } from 'react'
import { Bot, Folder, Info, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

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

function FolderRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="h-9 font-mono text-xs" />
        <Button variant="secondary" size="sm" className="shrink-0">
          Choose…
        </Button>
      </div>
    </div>
  )
}

export default function Settings(): React.JSX.Element {
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.api.getVersion().then(setVersion)
  }, [])

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-8 py-10">
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

        <Section
          icon={Folder}
          title="Workspace"
          description="Where Nisaba writes your library and generated code. Everything stays local."
        >
          <FolderRow label="Library" value="~/Nisaba/library" />
          <FolderRow label="Components" value="~/Nisaba/components" />
          <FolderRow label="Templates" value="~/Nisaba/templates" />
        </Section>

        <Section
          icon={Bot}
          title="Agents"
          description="Nisaba drives a CLI you already have installed and authenticated."
        >
          {['Claude Code CLI', 'Codex CLI'].map((agent) => (
            <div key={agent} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{agent}</p>
                <p className="text-xs text-muted-foreground">Not detected</p>
              </div>
              <Button variant="secondary" size="sm">
                Locate…
              </Button>
            </div>
          ))}
        </Section>

        <Section
          icon={Shield}
          title="Privacy"
          description="No account, no telemetry by default. Browsed pages are treated as untrusted."
        >
          <div className="flex items-center justify-between">
            <Label htmlFor="diagnostics" className="text-sm font-normal">
              Share anonymous diagnostics
            </Label>
            <Switch id="diagnostics" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="sanitize" className="text-sm font-normal">
              Strip scripts and form values from saved HTML
            </Label>
            <Switch id="sanitize" defaultChecked />
          </div>
        </Section>

        <Section icon={Info} title="About" description="Nisaba — Browse. Capture. Compound.">
          <p className="text-sm text-muted-foreground">
            Version <span className="font-mono text-foreground">{version || '…'}</span>
          </p>
        </Section>
      </div>
    </ScrollArea>
  )
}

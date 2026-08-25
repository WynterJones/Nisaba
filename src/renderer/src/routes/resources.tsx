import { useEffect, useState } from 'react'
import { ExternalLink, Library, ListPlus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { classifyResource, openInApp } from '@/actions'
import { AgentMenu } from '@/components/shell/agent-menu'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
import { parseUrlList, useLibrary } from '@/store'
import { useTerminals } from '@/terminals'
import { cn } from '@/lib/utils'
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
import type { AgentId, ResourceRecord } from '../../../preload'

const TYPE_LABEL: Record<ResourceRecord['type'], string> = {
  icons: 'Icons',
  'ui-kit': 'UI kit',
  fonts: 'Fonts',
  repository: 'Repository',
  tool: 'Tool',
  inspiration: 'Inspiration',
  other: 'Other'
}

function AddDialog(): React.JSX.Element {
  const refresh = useLibrary((s) => s.refresh)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const urls = parseUrlList(text)

  const save = async (): Promise<void> => {
    for (const url of urls) {
      const host = new URL(url).hostname.replace(/^www\./, '')
      await window.api.library.add<ResourceRecord>('resources', {
        id: `res-${Date.now()}-${Math.round(performance.now())}-${host}`,
        createdAt: Date.now(),
        name: host,
        url,
        type: classifyResource(url),
        description: '',
        tags: [],
        license: null
      })
    }
    await refresh()
    setOpen(false)
    setText('')
    toast.success(`Added ${urls.length} resource${urls.length === 1 ? '' : 's'}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <ListPlus className="size-4" />
          Add resources
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add resources</DialogTitle>
          <DialogDescription>
            One URL per line. Nisaba classifies each one from its address — icon sets, UI kits,
            fonts, repositories and tools all land in their own bucket.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          spellCheck={false}
          rows={9}
          placeholder={'lucide.dev\nui.shadcn.com\nfonts.google.com\ngithub.com/shadcn-ui/ui'}
          className="w-full resize-none rounded-lg border border-input bg-secondary/40 p-3 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-bright focus:bg-secondary"
        />

        <DialogFooter className="sm:justify-between">
          <span className="self-center text-xs text-muted-foreground">
            {urls.length} valid {urls.length === 1 ? 'URL' : 'URLs'}
          </span>
          <Button onClick={save} disabled={urls.length === 0}>
            Add {urls.length > 0 && urls.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Hands the list to the user's agent CLI in an interactive terminal. It asks what they are
 * building, goes and finds links, and appends them to the file Nisaba is watching — so
 * resources appear in this list while the conversation is still going.
 */
function BuildWithAI(): React.JSX.Element {
  const refresh = useLibrary((s) => s.refresh)
  const show = useTerminals((s) => s.show)
  const [starting, setStarting] = useState(false)

  useEffect(
    () =>
      window.api.resources.onAdded((added) => {
        void refresh()
        toast.success(`Added ${added} resource${added === 1 ? '' : 's'}`, {
          description: 'Found by your agent.'
        })
      }),
    [refresh]
  )

  const start = async (agent?: AgentId): Promise<void> => {
    setStarting(true)
    try {
      const terminal = await window.api.resources.curate(agent)
      show(terminal.id)
      toast.info('Your agent is reading the list', {
        description: 'Tell it what you are building in the terminal dock.'
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message.replace(/^Error: /, '') : String(error))
    } finally {
      setStarting(false)
    }
  }

  return (
    <AgentMenu size="sm" disabled={starting} onPick={(agent) => void start(agent.id)}>
      <Sparkles className="size-4" />
      Build with AI
    </AgentMenu>
  )
}

export default function Resources(): React.JSX.Element {
  const { resources, remove } = useLibrary()
  const [type, setType] = useState<string | null>(null)

  const types = [...new Set(resources.map((r) => r.type))]
  const shown = type ? resources.filter((r) => r.type === type) : resources

  return (
    <LibraryFrame
      icon={Library}
      title="Resources"
      items={shown}
      search={(r) => `${r.name} ${r.url} ${r.type}`}
      emptyTitle="No resources yet"
      emptyBlurb="Icon sets, UI kits, font collections and repositories worth keeping close. Paste a list and Nisaba sorts them by kind."
      note="Links you keep for building — icon sets, UI kits, fonts and repositories. Paste your own, or let an agent go and find them."
      actions={
        <>
          {types.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setType(null)}
                className={cn(
                  'rounded-md px-2 py-1 text-xs transition-colors',
                  type === null
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                All
              </button>
              {types.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={cn(
                    'rounded-md px-2 py-1 text-xs transition-colors',
                    type === t
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}
          <BuildWithAI />
          <AddDialog />
        </>
      }
    >
      {(rows) => (
        <ul className="divide-y divide-border">
          {rows.map((record) => (
            <li
              key={record.id}
              className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-[11px] font-semibold uppercase text-brand-bright">
                {record.name.charAt(0)}
              </span>
              <button
                onClick={() => openInApp(record.url)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">{record.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{record.url}</span>
              </button>
              <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
                {TYPE_LABEL[record.type]}
              </Badge>
              <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                {timeAgo(record.createdAt)}
              </span>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Open"
                  onClick={() => openInApp(record.url)}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Delete"
                  className="hover:text-destructive"
                  onClick={() => void remove('resources', record.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </LibraryFrame>
  )
}

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Bookmark, ExternalLink, Globe, ListPlus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { StatusBar } from '@/components/library/frame'
import { parseUrlList, useApp, useBookmarks } from '@/store'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { openInApp } from '@/actions'

function BulkAddDialog(): React.JSX.Element {
  const addUrls = useBookmarks((s) => s.addUrls)
  const setOverlay = useApp((s) => s.setOverlay)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const valid = useMemo(() => parseUrlList(text).length, [text])
  const lines = text.split('\n').filter((l) => l.trim()).length

  const save = (): void => {
    const { added, skipped } = addUrls(text)
    setOpen(false)
    setText('')
    toast.success(`Added ${added} bookmark${added === 1 ? '' : 's'}`, {
      description: skipped > 0 ? `${skipped} already in your library` : undefined
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setOverlay(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <ListPlus className="size-4" />
          Add bookmarks
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add bookmarks</DialogTitle>
          <DialogDescription>
            One URL per line. Paste as many as you like — the scheme is optional, duplicates and
            blank lines are dropped, and lines starting with # are ignored.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          spellCheck={false}
          rows={10}
          placeholder={'linear.app\nstripe.com/pricing\nhttps://ui.shadcn.com\n# inspiration\nvercel.com'}
          className="w-full resize-none rounded-lg border border-input bg-secondary/40 p-3 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-bright focus:bg-secondary"
        />

        <DialogFooter className="sm:justify-between">
          <span className="self-center text-xs text-muted-foreground">
            {valid} valid {valid === 1 ? 'URL' : 'URLs'}
            {lines > valid && ` · ${lines - valid} skipped`}
          </span>
          <Button onClick={save} disabled={valid === 0}>
            Add {valid > 0 && valid}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Bookmarks(): React.JSX.Element {
  const { bookmarks, remove } = useBookmarks()
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const shown = bookmarks.filter((b) =>
    `${b.title} ${b.url}`.toLowerCase().includes(query.toLowerCase())
  )

  const open = (url: string): void => {
    newTab(url)
    void navigate('/browse')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-5">
        <Bookmark className="size-4 text-brand-bright" />
        <h1 className="text-sm font-semibold">Bookmarks</h1>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
          {bookmarks.length}
        </span>

        <div className="ml-4 flex h-8 min-w-0 max-w-sm flex-1 items-center gap-2 rounded-lg border border-input bg-secondary/50 px-3 focus-within:border-brand-bright">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bookmarks"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="ml-auto">
          <BulkAddDialog />
        </div>
      </header>

      {bookmarks.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="grid size-14 place-items-center rounded-2xl border border-border bg-secondary/40">
            <Bookmark className="size-6 text-muted-foreground" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-medium">No bookmarks yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Pages worth returning to. Paste a whole list at once — one URL per line.
            </p>
          </div>
          <BulkAddDialog />
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ul className="divide-y divide-border">
            {shown.map((bookmark) => (
              <li
                key={bookmark.id}
                className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/40"
              >
                <Globe className="size-4 shrink-0 text-muted-foreground" />
                <button
                  onClick={() => open(bookmark.url)}
                  className="min-w-0 flex-1 text-left"
                  title={bookmark.url}
                >
                  <span className="block truncate text-sm font-medium">{bookmark.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {bookmark.url}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openInApp(bookmark.url)}
                    aria-label="Open in a new tab"
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(bookmark.id)}
                    aria-label="Delete bookmark"
                    className="hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                Nothing matches “{query}”.
              </li>
            )}
          </ul>
        </ScrollArea>
      )}

      <StatusBar>
        Pages you saved while browsing, plus anything you pasted in — they stay on this machine
        and open straight into a Nisaba tab.
      </StatusBar>
    </div>
  )
}

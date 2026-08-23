import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ExternalLink, FolderOpen, SquareDashedMousePointer, Trash2 } from 'lucide-react'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
import { SectionViewer } from '@/components/library/section-viewer'
import { TagEditor } from '@/components/library/tag-editor'
import { useApp, useLibrary } from '@/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SectionRecord } from '../../../preload'

export default function Sections(): React.JSX.Element {
  const { sections, remove } = useLibrary()
  const newTab = useApp((s) => s.newTab)
  const setOverlay = useApp((s) => s.setOverlay)
  const navigate = useNavigate()
  const [open, setOpen] = useState<SectionRecord | null>(null)

  const openViewer = (record: SectionRecord): void => {
    setOverlay(true)
    setOpen(record)
  }
  const closeViewer = (): void => {
    setOverlay(false)
    setOpen(null)
  }

  const revisit = (record: SectionRecord): void => {
    newTab(record.url)
    void navigate('/browse')
  }

  return (
    <>
      {open && (
        <SectionViewer
          record={sections.find((x) => x.id === open.id) ?? open}
          onClose={closeViewer}
        />
      )}
    <LibraryFrame
      icon={SquareDashedMousePointer}
      title="Sections"
      items={sections}
      search={(s) => `${s.name} ${s.url} ${s.selector} ${s.tech.map((t) => t.name).join(' ')}`}
      emptyTitle="No sections yet"
      emptyBlurb="Turn on Extract in Browse, click a region of a live page, then save it. Sections keep the screenshot, HTML, styles, tokens and where they came from."
      views={['grid', 'table']}
      groupBy={{ label: 'Site', of: (s) => s.host }}
      nameOf={(s) => s.name}
      tagsOf={(s) => s.tags ?? []}
    >
      {(shown, view) =>
        view === 'table' ? (
          <ul className="divide-y divide-border">
            {shown.map((record) => (
              <li
                key={record.id}
                className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-accent/40"
              >
                <img
                  src={window.api.library.url(record.file)}
                  alt=""
                  loading="lazy"
                  className="h-10 w-16 shrink-0 rounded border border-border object-cover object-top"
                />
                <button onClick={() => revisit(record)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{record.name}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {record.selector}
                  </span>
                </button>
                <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
                  {record.host}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                  {timeAgo(record.createdAt)}
                </span>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Reveal in Finder"
                    onClick={() => window.api.library.reveal(record.file)}
                  >
                    <FolderOpen className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Delete section"
                    className="hover:text-destructive"
                    onClick={() => void remove('sections', record.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4 p-5">
          {shown.map((record) => (
            <article
              key={record.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-brand/50"
            >
              <button
                onClick={() => openViewer(record)}
                title="Open this section"
                className="block max-h-56 overflow-hidden bg-secondary/40"
              >
                <img
                  src={window.api.library.url(record.file)}
                  alt={record.name}
                  loading="lazy"
                  className="w-full object-cover object-top"
                />
              </button>

              <div className="flex flex-col gap-2 border-t border-border p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <button onClick={() => openViewer(record)} className="block w-full text-left">
                      <p className="truncate text-sm font-medium">{record.name}</p>
                    </button>
                    <p className="truncate text-xs text-muted-foreground">
                      {record.host} · {timeAgo(record.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Reveal in Finder"
                      onClick={() => window.api.library.reveal(record.file)}
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Open source page"
                      onClick={() => window.api.browser.openExternal(record.url)}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete section"
                      className="hover:text-destructive"
                      onClick={() => void remove('sections', record.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <code className="truncate rounded bg-secondary/60 px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                  {record.selector}
                </code>

                <TagEditor collection="sections" id={record.id} tags={record.tags ?? []} />

                <div className="flex flex-wrap gap-1">
                  {record.colors.slice(0, 6).map((color, i) => (
                    <span
                      key={`${color}-${i}`}
                      title={color}
                      style={{ background: color }}
                      className="size-4 rounded border border-white/10"
                    />
                  ))}
                  {record.tech.slice(0, 2).map((t) => (
                    <Badge key={t.name} variant="secondary" className="text-[10px] font-normal">
                      {t.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
        )
      }
    </LibraryFrame>
    </>
  )
}

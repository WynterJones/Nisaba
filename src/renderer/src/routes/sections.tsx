import { useNavigate } from 'react-router'
import {
  ExternalLink,
  FolderOpen,
  SquareDashedMousePointer,
  Trash2
} from 'lucide-react'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
import { useApp, useLibrary } from '@/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SectionRecord } from '../../../preload'

export default function Sections(): React.JSX.Element {
  const { sections, remove } = useLibrary()
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()

  const revisit = (record: SectionRecord): void => {
    newTab(record.url)
    void navigate('/browse')
  }

  return (
    <LibraryFrame
      icon={SquareDashedMousePointer}
      title="Sections"
      items={sections}
      search={(s) => `${s.name} ${s.url} ${s.selector} ${s.tech.map((t) => t.name).join(' ')}`}
      emptyTitle="No sections yet"
      emptyBlurb="Turn on Extract in Browse, click a region of a live page, then save it. Sections keep the screenshot, HTML, styles, tokens and where they came from."
    >
      {(shown) => (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4 p-5">
          {shown.map((record) => (
            <article
              key={record.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-brand/50"
            >
              <button
                onClick={() => revisit(record)}
                title="Reopen the source page"
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
                    <p className="truncate text-sm font-medium">{record.name}</p>
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
      )}
    </LibraryFrame>
  )
}

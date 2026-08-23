import { useNavigate } from 'react-router'
import {
  ArrowRight,
  Camera,
  Crop,
  Layers,
  Search,
  Sparkles,
  SquareDashedMousePointer
} from 'lucide-react'
import logo from '@/assets/logo.png'
import { captureFullPage, captureRegion, captureViewport, startExtract } from '@/actions'
import { timeAgo } from '@/components/library/frame'
import { useApp, useLibrary, useSites } from '@/store'
import { toUrl } from '@/components/shell/browser-toolbar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

const QUICK_ACTIONS = [
  { icon: Camera, label: 'Capture viewport', hint: '⌘⇧2', run: captureViewport },
  { icon: Layers, label: 'Capture full page', hint: '⌘⇧3', run: captureFullPage },
  { icon: Crop, label: 'Capture region', hint: '⌘⇧4', run: captureRegion },
  { icon: SquareDashedMousePointer, label: 'Select section', hint: '⌘⇧E', run: startExtract }
]

export default function HomeRoute(): React.JSX.Element {
  const { newTab, tabs } = useApp()
  const { captures, sections } = useLibrary()
  const sites = useSites()
  const navigate = useNavigate()

  const hasTab = tabs.length > 0

  const stats = [
    { to: '/captures', label: 'Captures', value: captures.length },
    { to: '/sections', label: 'Sections', value: sections.length },
    { to: '/sites', label: 'Sites', value: sites.length },
    { to: '/components', label: 'Components', value: 0 },
    { to: '/templates', label: 'Templates', value: 0 }
  ]

  const go = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const input = new FormData(e.currentTarget).get('q') as string
    const url = toUrl(input)
    if (!url) return
    newTab(url)
    void navigate('/browse')
  }

  /** Capture actions need a live page; without one, send the user to Browse first. */
  const quick = (run: () => Promise<void>) => (): void => {
    if (!hasTab) return void navigate('/browse')
    void navigate('/browse')
    void run()
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-8 py-12">
        <header className="flex flex-col items-center gap-5 text-center">
          <img
            src={logo}
            alt="Nisaba"
            className="h-16 select-none mix-blend-screen"
            draggable={false}
          />
          <p className="max-w-lg text-sm text-muted-foreground">
            A browser that turns design research into a permanent, reusable library.
          </p>

          <form onSubmit={go} className="w-full max-w-xl">
            <div className="flex h-11 items-center gap-3 rounded-xl border border-input bg-secondary/50 px-4 transition-colors focus-within:border-brand-bright focus-within:bg-secondary">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                name="q"
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter a URL to browse, or search the web"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            </div>
          </form>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_ACTIONS.map(({ icon: Icon, label, hint, run }) => (
            <button
              key={label}
              onClick={quick(run)}
              title={hasTab ? label : 'Open a page in Browse first'}
              className="hover-lift group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand/50 hover:bg-accent hover:shadow-[0_8px_24px_-16px_var(--brand)]"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-secondary transition-colors group-hover:bg-brand/15">
                <Icon className="size-4 text-muted-foreground transition-all duration-150 group-hover:scale-110 group-hover:text-brand-bright" />
              </span>
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-[10px] text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Library</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map((stat) => (
              <button
                key={stat.to}
                onClick={() => navigate(stat.to)}
                className="hover-lift flex flex-col gap-1 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand/50"
              >
                <span className="text-2xl font-semibold tabular-nums">{stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent captures</h2>
            {captures.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/captures')}>
                View all
                <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>

          {captures.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center">
              <span className="grid size-11 place-items-center rounded-xl bg-secondary/60">
                <Sparkles className="size-5 text-muted-foreground" />
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">
                Nothing captured yet. Open a site in Browse and take your first screenshot — it will
                show up here with its source and metadata.
              </p>
              <Button size="sm" onClick={() => navigate('/browse')}>
                Start browsing
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {captures.slice(0, 8).map((record) => (
                <button
                  key={record.id}
                  onClick={() => navigate('/captures')}
                  className="group overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-brand/50"
                >
                  <span className="block aspect-[4/3] overflow-hidden bg-secondary/40">
                    <img
                      src={window.api.library.url(record.file)}
                      alt={record.title}
                      loading="lazy"
                      className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </span>
                  <span className="block truncate px-3 py-2 text-xs text-muted-foreground">
                    {record.host} · {timeAgo(record.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  )
}

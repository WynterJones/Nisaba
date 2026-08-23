import { useNavigate } from 'react-router'
import { Search } from 'lucide-react'
import logo from '@/assets/logo.png'
import { Backdrop } from '@/components/canvas/backdrop'
import { useApp } from '@/store'
import { toUrl } from '@/components/shell/browser-toolbar'

export default function HomeRoute(): React.JSX.Element {
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()

  const go = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const url = toUrl(new FormData(e.currentTarget).get('q') as string)
    if (!url) return
    newTab(url)
    void navigate('/browse')
  }

  return (
    <Backdrop>
      <div className="flex w-full max-w-xl flex-col items-center gap-7 px-8 pb-16 text-center">
        <img src={logo} alt="Nisaba" className="h-20 select-none" draggable={false} />

        <p className="text-sm text-muted-foreground">
          Browse. Capture. Compound.
        </p>

        <form onSubmit={go} className="w-full">
          <div className="flex h-12 items-center gap-3 rounded-xl border border-input bg-secondary/40 px-4 backdrop-blur-sm transition-colors focus-within:border-brand-bright focus-within:bg-secondary/70">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              name="q"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              placeholder="Enter a URL to browse, or search the web"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="shrink-0 rounded border border-border bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </form>
      </div>
    </Backdrop>
  )
}

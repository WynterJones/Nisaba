import { useNavigate } from 'react-router'
import { Camera, Globe, SquareDashedMousePointer } from 'lucide-react'
import { LibraryFrame, timeAgo } from '@/components/library/frame'
import { useApp, useSites } from '@/store'

export default function Sites(): React.JSX.Element {
  const sites = useSites()
  const newTab = useApp((s) => s.newTab)
  const navigate = useNavigate()

  return (
    <LibraryFrame
      icon={Globe}
      title="Sites"
      items={sites}
      search={(s) => s.host}
      emptyTitle="No sites yet"
      emptyBlurb="Every domain you capture from gets a record here, with everything you have taken from it."
      nameOf={(s) => s.host}
    >
      {(shown) => (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3 p-5">
          {shown.map((site) => (
            <button
              key={site.host}
              onClick={() => {
                newTab(site.latestUrl)
                void navigate('/browse')
              }}
              className="hover-lift flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand/50"
            >
              <div className="flex items-center gap-2">
                {/* A local monogram, not a remote favicon service — browsed hosts stay on this machine. */}
                <span className="grid size-5 shrink-0 place-items-center rounded bg-brand/20 text-[10px] font-semibold uppercase text-brand-bright">
                  {site.host.replace(/^www\./, '').charAt(0)}
                </span>
                <span className="truncate text-sm font-medium">{site.host}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Camera className="size-3.5" />
                  {site.captures}
                </span>
                <span className="flex items-center gap-1.5">
                  <SquareDashedMousePointer className="size-3.5" />
                  {site.sections}
                </span>
                <span className="ml-auto">{timeAgo(site.lastSeen)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </LibraryFrame>
  )
}

import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { captureFullPage, captureRegion, captureViewport, startExtract } from '@/actions'
import { useApp, useLibrary } from '@/store'
import { CommandPalette } from '@/components/shell/command-palette'
import { JobsDrawer } from '@/components/shell/jobs-drawer'
import { Sidebar } from '@/components/shell/sidebar'
import { Splash } from '@/components/shell/splash'
import { TitleBar } from '@/components/shell/title-bar'
import Bookmarks from '@/routes/bookmarks'
import Browse from '@/routes/browse'
import Captures from '@/routes/captures'
import { Components, Templates } from '@/routes/components'
import DesignSystems from '@/routes/design-systems'
import Elements from '@/routes/elements'
import HomeRoute from '@/routes/home'
import Jobs from '@/routes/jobs'
import Audits from '@/routes/audits'
import Resources from '@/routes/resources'
import Settings from '@/routes/settings'
import Sites from '@/routes/sites'
import Workspaces from '@/routes/workspaces'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

/** ⌘⇧2/3/4 capture, ⌘⇧E extracts — the same handlers the toolbar menu calls. */
function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return
      const run = {
        '@': captureViewport,
        '2': captureViewport,
        '#': captureFullPage,
        '3': captureFullPage,
        $: captureRegion,
        '4': captureRegion,
        e: startExtract,
        E: startExtract
      }[e.key]
      if (run) {
        e.preventDefault()
        void run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Shell(): React.JSX.Element {
  const patchTab = useApp((s) => s.patchTab)
  const refresh = useLibrary((s) => s.refresh)

  useEffect(() => window.api.browser.onTabUpdated(patchTab), [patchTab])
  useEffect(() => void refresh(), [refresh])
  useShortcuts()

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TitleBar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/bookmarks" element={<Bookmarks />} />
            <Route path="/captures" element={<Captures />} />
            <Route path="/sites" element={<Sites />} />
            <Route path="/elements" element={<Elements />} />
            <Route path="/design-systems" element={<DesignSystems />} />
            <Route path="/components" element={<Components />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/audits" element={<Audits />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/workspaces" element={<Workspaces />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <JobsDrawer />
      </div>
      <CommandPalette />
      <Splash />
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <HashRouter>
      <TooltipProvider delayDuration={300}>
        <Shell />
        <Toaster position="top-center" />
      </TooltipProvider>
    </HashRouter>
  )
}

import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { NAV_ITEMS } from '@/nav'
import { useApp } from '@/store'
import { CommandPalette } from '@/components/shell/command-palette'
import { JobsDrawer } from '@/components/shell/jobs-drawer'
import { Sidebar } from '@/components/shell/sidebar'
import { TitleBar } from '@/components/shell/title-bar'
import Browse from '@/routes/browse'
import HomeRoute from '@/routes/home'
import LibraryRoute from '@/routes/library'
import Settings from '@/routes/settings'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

const LIBRARY_ITEMS = NAV_ITEMS.filter(
  (item) => !['/', '/browse', '/settings'].includes(item.to)
)

function Shell(): React.JSX.Element {
  const patchTab = useApp((s) => s.patchTab)

  useEffect(() => window.api.browser.onTabUpdated(patchTab), [patchTab])

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TitleBar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/settings" element={<Settings />} />
            {LIBRARY_ITEMS.map((item) => (
              <Route key={item.to} path={item.to} element={<LibraryRoute item={item} />} />
            ))}
          </Routes>
        </main>
        <JobsDrawer />
      </div>
      <CommandPalette />
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <HashRouter>
      <TooltipProvider delayDuration={300}>
        <Shell />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </HashRouter>
  )
}

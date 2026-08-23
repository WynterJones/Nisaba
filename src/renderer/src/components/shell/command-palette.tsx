import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Globe, Plus } from 'lucide-react'
import { NAV } from '@/nav'
import { useApp } from '@/store'
import { toUrl } from '@/components/shell/browser-toolbar'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'

export function CommandPalette(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { tabs, newTab, activateTab, setOverlay } = useApp()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = (fn: () => void): void => {
    fn()
    setOpen(false)
    setQuery('')
  }

  const looksLikeUrl = query.trim().length > 0

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setOverlay(next)
      }}
      title="Command palette"
      description="Jump to a library, open a tab, or enter a URL"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Go to a library, open a tab, or enter a URL…"
      />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {looksLikeUrl && (
          <>
            <CommandGroup heading="Browse">
              <CommandItem
                value={`open ${query}`}
                onSelect={() =>
                  run(() => {
                    newTab(toUrl(query))
                    void navigate('/browse')
                  })
                }
              >
                <Plus />
                Open <span className="font-medium text-foreground">{query}</span> in a new tab
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {NAV.map((group, i) => (
          <CommandGroup key={group.label ?? i} heading={group.label ?? 'Navigate'}>
            {group.items.map((item) => (
              <CommandItem
                key={item.to}
                value={item.label}
                onSelect={() => run(() => void navigate(item.to))}
              >
                <item.icon />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {tabs.length > 0 && (
          <CommandGroup heading="Open tabs">
            {tabs.map((tab) => (
              <CommandItem
                key={tab.id}
                value={`${tab.title} ${tab.url}`}
                onSelect={() =>
                  run(() => {
                    activateTab(tab.id)
                    void navigate('/browse')
                  })
                }
              >
                <Globe />
                <span className="truncate">{tab.title}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">{tab.url}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

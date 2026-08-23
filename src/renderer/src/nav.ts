import {
  Blocks,
  BookMarked,
  Bookmark,
  Camera,
  Compass,
  Frame,
  Globe,
  Home,
  LayoutTemplate,
  Library,
  ListTodo,
  Palette,
  PenLine,
  Settings,
  SquareLibrary,
  type LucideIcon
} from 'lucide-react'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  /** Empty-state copy, also shown as the flyout subtitle. */
  blurb?: string
}

/** A sidebar row that opens a shelf of related destinations instead of navigating. */
export type NavFlyout = { key: string; label: string; icon: LucideIcon; items: NavItem[] }

export type NavEntry = NavItem | NavFlyout

export function isFlyout(entry: NavEntry): entry is NavFlyout {
  return 'items' in entry
}

export const KNOWLEDGE: NavFlyout = {
  key: 'knowledge',
  label: 'Knowledge',
  icon: BookMarked,
  items: [
    {
      to: '/bookmarks',
      label: 'Bookmarks',
      icon: Bookmark,
      blurb: 'Pages worth returning to, with tags, collections and notes.'
    },
    {
      to: '/sites',
      label: 'Sites',
      icon: Globe,
      blurb: 'One canonical record per domain, with everything captured from it.'
    },
    {
      to: '/resources',
      label: 'Resources',
      icon: Library,
      blurb: 'Icon sets, UI kits, fonts and repositories worth keeping close.'
    }
  ]
}

export const NAV: { label?: string; entries: NavEntry[] }[] = [
  {
    entries: [
      { to: '/', label: 'Home', icon: Home },
      { to: '/browse', label: 'Browse', icon: Compass }
    ]
  },
  {
    label: 'Library',
    entries: [
      KNOWLEDGE,
      {
        to: '/captures',
        label: 'Captures',
        icon: Camera,
        blurb: 'Viewport, full-page and region screenshots with their source metadata.'
      },
      {
        to: '/audits',
        label: 'Audits',
        icon: PenLine,
        blurb: 'Page reviews pinned to real elements, exported as a task plan an agent can work.'
      },
      {
        to: '/design-systems',
        label: 'Design Systems',
        icon: Palette,
        blurb: 'Extracted colors, type, spacing and motion, as editable tokens.'
      },
      {
        to: '/templates',
        label: 'Templates',
        icon: LayoutTemplate,
        blurb: 'Multi-section pages assembled from your saved research.'
      },
      {
        to: '/components',
        label: 'Components',
        icon: Frame,
        blurb: 'Generated implementations, previewed and verified against their source.'
      },
      {
        to: '/elements',
        label: 'Elements',
        icon: Blocks,
        blurb: 'Normalized primitives — buttons, inputs, cards — compared across sites.'
      }
    ]
  }
]

/** Reached from the workspace switcher at the foot of the sidebar, not from a nav row. */
export const SYSTEM: NavItem[] = [
  {
    to: '/workspaces',
    label: 'Workspaces',
    icon: SquareLibrary,
    blurb: 'Root folders, output stacks and prompt profiles an agent is allowed to write to.'
  },
  { to: '/settings', label: 'Settings', icon: Settings }
]

/** Reached from the Tasks bar. */
export const JOBS: NavItem = {
  to: '/jobs',
  label: 'Jobs',
  icon: ListTodo,
  blurb: 'Agent runs, logs and results.'
}

export const NAV_ITEMS: NavItem[] = [
  ...NAV.flatMap((group) => group.entries.flatMap((e) => (isFlyout(e) ? e.items : [e]))),
  ...SYSTEM,
  JOBS
]

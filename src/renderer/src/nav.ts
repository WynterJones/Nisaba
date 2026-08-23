import {
  Blocks,
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
  Settings,
  SquareLibrary,
  SquareDashedMousePointer,
  type LucideIcon
} from 'lucide-react'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  /** Empty-state copy shown by the shared library route until the real data layer lands. */
  blurb?: string
}

export type NavGroup = { label?: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Home', icon: Home },
      { to: '/browse', label: 'Browse', icon: Compass }
    ]
  },
  {
    label: 'Library',
    items: [
      {
        to: '/bookmarks',
        label: 'Bookmarks',
        icon: Bookmark,
        blurb: 'Pages worth returning to, with tags, collections and notes.'
      },
      {
        to: '/captures',
        label: 'Captures',
        icon: Camera,
        blurb: 'Viewport, full-page and region screenshots with their source metadata.'
      },
      {
        to: '/sections',
        label: 'Sections',
        icon: SquareDashedMousePointer,
        blurb: 'Reusable page regions with screenshot, HTML, styles and provenance.'
      },
      {
        to: '/elements',
        label: 'Elements',
        icon: Blocks,
        blurb: 'Normalized primitives — buttons, inputs, cards — compared across sites.'
      },
      {
        to: '/design-systems',
        label: 'Design Systems',
        icon: Palette,
        blurb: 'Extracted colors, type, spacing and motion, as editable tokens.'
      },
      {
        to: '/components',
        label: 'Components',
        icon: Frame,
        blurb: 'Generated implementations, previewed and verified against their source.'
      },
      {
        to: '/templates',
        label: 'Templates',
        icon: LayoutTemplate,
        blurb: 'Multi-section pages assembled from your saved research.'
      },
      {
        to: '/resources',
        label: 'Resources',
        icon: Library,
        blurb: 'Icon sets, UI kits, fonts and repositories worth keeping close.'
      },
      {
        to: '/sites',
        label: 'Sites',
        icon: Globe,
        blurb: 'One canonical record per domain, with everything captured from it.'
      }
    ]
  },
  {
    label: 'System',
    items: [
      { to: '/jobs', label: 'Jobs', icon: ListTodo, blurb: 'Agent runs, logs and results.' },
      {
        to: '/workspaces',
        label: 'Workspaces',
        icon: SquareLibrary,
        blurb: 'Root folders, output stacks and prompt profiles an agent is allowed to write to.'
      },
      { to: '/settings', label: 'Settings', icon: Settings }
    ]
  }
]

export const NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items)

<div align="center">

<img src="docs/logo.png" alt="Nisaba" height="110">

### Browse. Capture. Compound.

A desktop browser for designers and developers whose browsing should leave something behind.

[![License: MIT](https://img.shields.io/badge/license-MIT-7928DB.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33-7928DB.svg)](https://electronjs.org)
[![React](https://img.shields.io/badge/React-19-7928DB.svg)](https://react.dev)
[![Local first](https://img.shields.io/badge/local--first-no%20account-7928DB.svg)](#privacy)

<img src="docs/screenshot.png" alt="Nisaba in extract mode: a live page with the DOM selection overlay active and the inspector open" width="100%">

<sub>Extract mode — hover the live page, walk the DOM with the arrow keys, click to keep everything about a region.</sub>

</div>

---

## Why

You find a pricing section you love. You screenshot it. Three months later you have a folder of
4,000 PNGs named `Screenshot 2026-04-11 at 14.22.03.png` and no idea which site any of them came
from, what fonts they used, or how the layout worked.

Nisaba is the browser that fixes that. You browse normally — but every capture keeps its source
URL, its DOM, its CSS, its fonts, its design tokens and its provenance. The library gets more
useful the longer you use it, and when you want the pattern back, an agent turns it into real code
in your stack.

**It is not your daily browser.** It's the one you open when your library needs to grow.

## What it does

| | |
| --- | --- |
| 🦊 **Browse** | Tabs, viewport presets, rulers and grid overlays. Every page runs fully sandboxed. |
| 📸 **Capture** | Viewport, full-page, region or element — annotated with arrows, blur and callouts, stored separately from the original. |
| 🔍 **Extract** | Click a section and keep its sanitized HTML, matched CSS, computed styles, variables, fonts, assets and accessibility tree. |
| 🎨 **Profile** | Infer a site's design language into an editable `design.md`, `tokens.json` and `site-profile.json`. |
| 🧱 **Organize** | Typed libraries — Sites, Captures, Sections, Elements, Design Systems, Components, Templates, Resources — with full-text search, tags, collections and duplicate detection. |
| ✨ **Convert** | Hand a saved section to Claude Code or Codex and get a component in React, Tailwind, shadcn/ui, Next.js, plain HTML or your own profile. |
| ✅ **Verify** | Preview the generated result, compare it against the source at matching viewports, annotate corrections and send them back. |
| 🔒 **Own it** | SQLite and files on your disk. No account, no sync, no telemetry. |

## Status

Nisaba is being built in phases. The core loop — browse, capture, extract, organize — works today.

**Working**

- [x] Multi-tab browsing in isolated `WebContentsView`s with default-deny permissions
- [x] Capture: visible viewport, full scrollable page (via CDP, beyond the viewport), dragged region, picked element
- [x] Extract: hover-to-select overlay with arrow-key DOM navigation, returning a robust selector, sanitized HTML, computed styles, CSS custom properties, fonts, palette, assets and accessibility metadata
- [x] Technology detection with a confidence score and the evidence behind it
- [x] Library on disk: Captures, Sections, Sites and Bookmarks, with search, delete and reveal-in-Finder
- [x] Agent CLI detection for Claude Code and Codex, and a resolved-prompt preview before any run
- [x] Keyboard shortcuts, command palette, single-instance locking

**Not yet**

- [ ] Annotation editor for captures
- [ ] Design system extraction and `design.md` generation
- [ ] Element Style Matrix, Components, Templates, Resources
- [ ] Running agent jobs and verifying their output
- [ ] SQLite, workspaces and portable export

Screens that are specified but not implemented say so plainly in the app rather than showing a
fake empty state.

<img src="docs/library.png" alt="The Captures library with real screenshots of Vercel, Stripe and Linear" width="100%">

The full specification, including all eight phases and their acceptance criteria, lives in
[`_PLANS/PRD.md`](_PLANS/PRD.md).

## Install

Prebuilt installers for macOS, Windows and Linux are published on the
[Releases](https://github.com/WynterJones/Nisaba/releases) page. The app updates itself from there.

## Develop

```bash
git clone https://github.com/WynterJones/Nisaba.git
cd Nisaba
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev build with hot reload |
| `npm run build` | Type-check and build to `out/` |
| `npm run dist` | Build a local installer into `dist/` |
| `npm run release` | Build all platforms and publish to GitHub Releases |

### Layout

```text
src/
  main/
    browser.ts    Tab lifecycle and isolated WebContentsViews
    capture.ts    Viewport, full-page (CDP) and region screenshots
    extract.ts    The in-page selection overlay and artifact collector
    library.ts    On-disk index, the nisaba:// asset protocol
    agents.ts     CLI discovery and version probing
  preload/        The narrow typed bridge; the only surface the app UI can call
  renderer/       React + Tailwind + shadcn/ui application UI
_PLANS/           Product requirements and design references
```

## Architecture

Three trust levels, and remote pages sit at the bottom of all of them:

- **Main process** — owns windows, the database, the filesystem, screenshots and any CLI it
  launches. Nothing else touches those.
- **App renderer** — the Nisaba UI. Talks to main through one typed IPC surface, never Node.
- **Remote page views** — every site you browse, in its own `WebContentsView` with
  `nodeIntegration: false`, `contextIsolation: true`, sandbox on, no preload bridge and every
  permission denied by default.

Text scraped from a webpage is treated as **data, never instructions** — including when it is
packaged up and handed to an agent.

## Privacy

No account. No cloud. Your captures, prompts and generated code stay on your machine, and the only
thing that ever leaves it is what you explicitly send through an agent CLI you installed and
authenticated yourself. Diagnostics are opt-in and off.

## Contributing

Issues and pull requests are welcome. Phase-scoped work is easiest to review — check the current
phase in [Status](#status) and in the PRD before starting something large.

## Name

[Nisaba](https://en.wikipedia.org/wiki/Nisaba) was the Sumerian goddess of writing, accounting and
the scribal arts — the one who kept the records. Fitting for a tool whose whole job is making sure
what you found doesn't get lost.

## License

MIT © [Wynter Jones](https://github.com/WynterJones)

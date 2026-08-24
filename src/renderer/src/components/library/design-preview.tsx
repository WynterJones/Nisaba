import { useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  applyLevels,
  googleFontsHref,
  LEVEL_LABELS,
  type DesignSpec,
  type Level,
  type Levels
} from '../../../../shared/design-spec'
import { cn } from '@/lib/utils'

/**
 * Loads the profile's Google fonts into the app document. Without this every preview falls
 * back to the platform serif, which is the one thing guaranteed to misrepresent the page.
 * One <link> per href, shared across previews and left in place — refetching is free, and
 * removing it would strip the face out from under a dialog that reopens.
 */
function useGoogleFont(href: string): void {
  useEffect(() => {
    if (document.querySelector(`link[href="${CSS.escape(href)}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }, [href])
}

/** `{typography.label-md}` → the token it points at. Anything else is already a literal. */
function typeOf(spec: DesignSpec, ref: string | undefined): React.CSSProperties {
  const name = ref?.match(/^\{typography\.(.+)\}$/)?.[1] ?? ref
  const token = name ? spec.typography[name] : undefined
  if (!token) return {}
  return {
    fontFamily: token.fontFamily,
    fontSize: token.fontSize,
    fontWeight: Number(token.fontWeight) || 400,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing
  }
}

/**
 * A component's tokens as inline style. Buttons and fields get a flex line box so the measured
 * height is respected without the label drifting off centre.
 */
function boxOf(spec: DesignSpec, name: string, control = false): React.CSSProperties {
  const c = spec.components[name]
  if (!c) return {}
  return {
    background: c.backgroundColor,
    color: c.textColor,
    borderRadius: c.rounded,
    padding: c.padding,
    boxShadow: c.shadow && c.shadow !== 'none' ? c.shadow : undefined,
    border: c.borderColor ? `${c.borderWidth || '1px'} solid ${c.borderColor}` : '1px solid transparent',
    ...(control
      ? {
          height: c.height,
          display: 'inline-flex',
          alignItems: 'center',
          boxSizing: 'border-box' as const,
          whiteSpace: 'nowrap' as const,
          cursor: 'pointer'
        }
      : {}),
    ...typeOf(spec, c.typography)
  }
}

/** Three-stop dial. Level 2 is always the page as measured, which the label says out loud. */
function LevelDial({
  name,
  value,
  onChange
}: {
  name: keyof Levels
  value: Level
  onChange: (level: Level) => void
}): React.JSX.Element {
  const labels = LEVEL_LABELS[name]
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {name}
      </span>
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-secondary/40 p-0.5">
        {([1, 2, 3] as Level[]).map((level) => (
          <button
            key={level}
            onClick={() => onChange(level)}
            title={labels[level - 1]}
            className={cn(
              'flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 text-[11px] transition-colors',
              value === level
                ? 'bg-brand/20 text-brand-bright ring-1 ring-inset ring-brand/40'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <span className="font-bold tabular-nums">{level}</span>
            <span className="truncate">{labels[level - 1]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Label({ children, tint }: { children: string; tint: string }): React.JSX.Element {
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: tint, opacity: 0.5, fontFamily: 'inherit' }}
    >
      {children}
    </span>
  )
}

/**
 * Renders the measured components with the level dials applied, on the page's own surface
 * colour — the only honest backdrop for tokens taken off that page. Nothing is ever omitted:
 * anything the page lacked was derived when the profile was built, and is flagged below.
 */
export function DesignPreview({
  spec,
  levels,
  onLevels
}: {
  spec: DesignSpec
  levels: Levels
  onLevels: (levels: Levels) => void
}): React.JSX.Element {
  // applyLevels completes an older spec, so read fonts and `derived` off the result of it.
  const resolved = applyLevels(spec, levels)
  useGoogleFont(googleFontsHref(resolved.fonts))
  const surface = resolved.colors.surface ?? '#ffffff'
  const onSurface = resolved.colors['on-surface'] ?? '#111111'
  const body = typeOf(resolved, 'body-md')

  const primary = boxOf(resolved, 'button-primary', true)
  const secondary = boxOf(resolved, 'button-secondary', true)
  const tertiary = boxOf(resolved, 'button-tertiary', true)
  const field = boxOf(resolved, 'input-field', true)
  const select = boxOf(resolved, 'select-field', true)
  const card = boxOf(resolved, 'card')
  const heading = typeOf(resolved, 'headline-md')
  const small = typeOf(resolved, 'body-sm')

  const derived = new Set(resolved.derived)
  const gap = parseFloat(resolved.spacing.md ?? resolved.spacing.unit ?? '16px') || 16

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {(['shape', 'density', 'emphasis'] as (keyof Levels)[]).map((name) => (
          <LevelDial
            key={name}
            name={name}
            value={levels[name]}
            onChange={(level) => onLevels({ ...levels, [name]: level })}
          />
        ))}
      </div>

      <div
        className="overflow-auto rounded-lg border border-border"
        style={{ background: surface, color: onSurface, ...body, maxHeight: '44vh' }}
      >
        <div className="flex flex-col p-6" style={{ gap: gap * 1.75 }}>
          <section className="flex flex-col" style={{ gap: gap * 0.75 }}>
            <Label tint={onSurface}>Buttons</Label>
            <div className="flex flex-wrap items-center" style={{ gap: gap * 0.75 }}>
              <button style={primary}>Get started</button>
              <button style={secondary}>Learn more</button>
              <button style={tertiary}>Cancel</button>
            </div>
          </section>

          <section className="flex flex-col" style={{ gap: gap * 0.75 }}>
            <Label tint={onSurface}>Fields</Label>
            <div className="flex flex-wrap items-center" style={{ gap: gap * 0.75 }}>
              <input
                readOnly
                placeholder="you@example.com"
                style={{ ...field, minWidth: 240, cursor: 'text', outline: 'none' }}
              />
              <span className="relative inline-flex items-center">
                <select
                  style={{
                    ...select,
                    minWidth: 190,
                    appearance: 'none',
                    paddingRight: 36,
                    outline: 'none'
                  }}
                >
                  <option>Choose a plan</option>
                  <option>Starter</option>
                  <option>Pro</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 size-3.5"
                  style={{ opacity: 0.55 }}
                />
              </span>
            </div>
          </section>

          <section className="flex flex-col" style={{ gap: gap * 0.75 }}>
            <Label tint={onSurface}>Card</Label>
            <div style={{ ...card, maxWidth: 460 }}>
              <div className="flex flex-col" style={{ gap: gap * 0.5 }}>
                <span style={{ ...small, opacity: 0.6 }}>This month</span>
                <span style={heading}>Usage summary</span>
                <span style={{ ...body, opacity: 0.75 }}>
                  Everything that changed since your last visit, grouped by the part of the
                  product it touched.
                </span>
                <div
                  className="flex flex-wrap items-center"
                  style={{ gap: gap * 0.75, marginTop: gap * 0.5 }}
                >
                  <button style={primary}>Open report</button>
                  <button style={tertiary}>Dismiss</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Set in <span className="text-foreground">{resolved.fonts.body.google}</span>
        {resolved.fonts.body.google !== resolved.fonts.body.requested && (
          <> — the closest Google font to the page&apos;s {resolved.fonts.body.requested}</>
        )}
        . Level 2 on every dial is the page exactly as measured.
        {derived.size > 0 && (
          <>
            {' '}
            <span className="text-amber-300/80">
              {[...derived].join(', ')} {derived.size === 1 ? 'was' : 'were'} not on the page and{' '}
              {derived.size === 1 ? 'was' : 'were'} derived from the rest of the system.
            </span>
          </>
        )}
      </p>
    </div>
  )
}

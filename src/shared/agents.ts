export type AgentId = 'claude' | 'codex' | 'grok' | 'opencode'

/**
 * Every CLI Nisaba can hand work to. `open` starts a conversation the user can carry on;
 * `headless` runs to completion and exits, which is what a job needs.
 * ponytail: flags are the documented ones per CLI — if one changes its interface, it changes
 * here and nowhere else.
 */
export const AGENTS: Record<
  AgentId,
  { label: string; open: (prompt: string) => string[]; headless: (prompt: string) => string[] }
> = {
  claude: {
    label: 'Claude Code',
    open: (p) => ['--permission-mode', 'acceptEdits', p],
    // Plain `--print` says nothing until the whole run finishes, which on a long job leaves the
    // terminal looking dead for minutes. Stream the events and render them.
    headless: (p) => [
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'acceptEdits',
      p
    ]
  },
  codex: {
    label: 'Codex',
    open: (p) => [p],
    headless: (p) => ['exec', '--full-auto', p]
  },
  grok: {
    label: 'Grok',
    open: (p) => [p],
    headless: (p) => ['--prompt', p]
  },
  opencode: {
    label: 'OpenCode',
    // opencode's interactive mode takes no opening prompt, so both modes use `run`.
    open: (p) => ['run', p],
    headless: (p) => ['run', p]
  }
}

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[]

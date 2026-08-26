export type AgentId = 'claude' | 'codex' | 'grok' | 'opencode'

/**
 * Every CLI Nisaba can hand work to. `open` starts a conversation the user can carry on;
 * `headless` runs to completion and exits, which is what a job needs.
 * ponytail: flags are the documented ones per CLI — if one changes its interface, it changes
 * here and nowhere else.
 */
export const AGENTS: Record<
  AgentId,
  {
    label: string
    /** `yolo` swaps in the CLI's own skip-every-prompt flag, where it has one. */
    open: (prompt: string, yolo?: boolean) => string[]
    headless: (prompt: string) => string[]
    /** Whether `open` actually honours `yolo` — drives what Settings offers. */
    yolo: string | null
  }
> = {
  claude: {
    label: 'Claude Code',
    yolo: 'Skips every permission prompt (--dangerously-skip-permissions)',
    open: (p, yolo) =>
      yolo ? ['--dangerously-skip-permissions', p] : ['--permission-mode', 'acceptEdits', p],
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
    yolo: 'Runs without approvals or sandbox (--yolo)',
    open: (p, yolo) => (yolo ? ['--yolo', p] : [p]),
    headless: (p) => ['exec', '--full-auto', p]
  },
  grok: {
    label: 'Grok',
    yolo: null,
    open: (p) => [p],
    headless: (p) => ['--prompt', p]
  },
  opencode: {
    label: 'OpenCode',
    yolo: null,
    // opencode's interactive mode takes no opening prompt, so both modes use `run`.
    open: (p) => ['run', p],
    headless: (p) => ['run', p]
  }
}

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[]

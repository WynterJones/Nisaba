import { create } from 'zustand'
import type { AgentInstallation } from '../../preload'

type AgentState = {
  /** Null until the first probe lands; then every known CLI, installed or not. */
  agents: AgentInstallation[] | null
  refresh: () => Promise<void>
}

/**
 * Which agent CLIs this machine has. Detection shells out per CLI, so it runs once at startup
 * and every button that offers a choice reads the same answer.
 */
export const useAgentStore = create<AgentState>((set) => ({
  agents: null,
  refresh: async () => {
    set({ agents: null })
    set({ agents: await window.api.agents.detect().catch(() => []) })
  }
}))

void useAgentStore.getState().refresh()

export const useAgents = (): AgentInstallation[] | null => useAgentStore((s) => s.agents)
export const refreshAgents = (): Promise<void> => useAgentStore.getState().refresh()

export interface SpaceAgentActivity {
  title: string | null;
  updatedAt: string;
}

/**
 * Newest non-unattended conversation per agent. Callers pass `useSpaceChats`
 * rows, which already omit unattended runs.
 */
export function latestConversationByAgent(
  rows: readonly {
    agentId: string;
    title: string | null;
    updatedAt: string;
  }[]
): Map<string, SpaceAgentActivity> {
  const latest = new Map<string, SpaceAgentActivity>();
  for (const row of rows) {
    const existing = latest.get(row.agentId);
    if (!existing || row.updatedAt > existing.updatedAt) {
      latest.set(row.agentId, {
        title: row.title,
        updatedAt: row.updatedAt,
      });
    }
  }
  return latest;
}

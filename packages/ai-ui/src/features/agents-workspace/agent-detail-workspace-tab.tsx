// Workspace tab wiring — thin wrapper mirroring agent-detail-files-tab.

import { AgentWorkspaceTab } from "./agent-workspace-tab";
import type { useAgentWorkspaceTab } from "./use-agent-workspace-tab";

interface AgentDetailWorkspaceTabProps {
  t: (key: string) => string;
  workspace: ReturnType<typeof useAgentWorkspaceTab>;
}

export function AgentDetailWorkspaceTab({
  t,
  workspace,
}: AgentDetailWorkspaceTabProps) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      <div className="mx-auto w-full max-w-none space-y-6 p-page">
        <AgentWorkspaceTab t={t} workspace={workspace} />
      </div>
    </div>
  );
}

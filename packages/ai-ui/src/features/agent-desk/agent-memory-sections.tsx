// MEMORY.md and TASKS.md as editable pads — what the engenty keeps for itself
// in one Space. The run writes them through `memory_note` / `memory_forget`
// and the tasks tools; here a person reads, corrects a line, or clears.
// Save is explicit (not on blur): a half-typed edit to an agent's memory must
// not land by accident. Shared by the desk's Manage panel and the agent
// detail's Memory tab, so the two never disagree about the same row.
import { AgentPadSection } from "./agent-pad-section.js";
import {
  useAgentMemoryQuery,
  useSaveAgentMemoryMutation,
} from "./use-agent-memory.js";
import {
  useAgentTasksQuery,
  useSaveAgentTasksMutation,
} from "./use-agent-tasks.js";

export function AgentMemorySection({
  agentId,
  editable,
  spaceId,
}: {
  agentId: string;
  editable: boolean;
  spaceId: string | null;
}) {
  const query = useAgentMemoryQuery({ agentId, spaceId });
  const save = useSaveAgentMemoryMutation({ agentId, spaceId });
  const stored = query.data?.memory ?? "";
  return (
    <AgentPadSection
      clear={{
        disabled: !stored,
        run: (onSuccess) => save.mutate("", { onSuccess }),
      }}
      editable={editable}
      enabled={query.data?.enabled ?? true}
      kind="memory"
      maxChars={query.data?.max_chars ?? 8000}
      save={save}
      stored={stored}
    />
  );
}

export function AgentTasksSection({
  agentId,
  editable,
  spaceId,
}: {
  agentId: string;
  editable: boolean;
  spaceId: string | null;
}) {
  const query = useAgentTasksQuery({ agentId, spaceId });
  const save = useSaveAgentTasksMutation({ agentId, spaceId });
  const stored = query.data?.tasks ?? "";
  return (
    <AgentPadSection
      clear={{
        disabled: !stored,
        run: (onSuccess) => save.mutate("", { onSuccess }),
      }}
      editable={editable}
      enabled={query.data?.enabled ?? true}
      kind="tasks"
      maxChars={query.data?.max_chars ?? 6000}
      save={save}
      stored={stored}
    />
  );
}

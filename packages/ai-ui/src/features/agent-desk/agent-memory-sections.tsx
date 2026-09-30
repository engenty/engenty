// The agent's own memory entries and TASKS.md — what the engenty keeps for
// itself in one Space (or, for a personal agent, for its person). The run
// writes them through `memory_note` / `memory_forget` and the tasks tool;
// here a person reads and corrects them. Shared by the desk's Manage panel
// and the agent detail's Memory tab, so the two never disagree about the
// same rows.
import { useTranslation } from "@engenty/i18n/ui";
import { MemoryEntriesSection } from "../memory/memory-entries-section.js";
import { AgentPadSection } from "./agent-pad-section.js";
import {
  useAgentTasksQuery,
  useSaveAgentTasksMutation,
} from "./use-agent-tasks.js";

/** Whether a person may change a line is the server's answer (`can_edit`). */
export function AgentMemorySection({
  agentId,
  spaceId,
}: {
  agentId: string;
  spaceId: string | null;
}) {
  const { t } = useTranslation("ai-ui");
  return (
    <MemoryEntriesSection
      description={t("memoryEntries.agentDescription")}
      entryKey={{ agentId, scope: "agent", spaceId }}
      title={t("memoryEntries.agentTitle")}
    />
  );
}

/** A person's own facts, which every assistant sees on a private line with them. */
export function UserMemorySection() {
  const { t } = useTranslation("ai-ui");
  return (
    <MemoryEntriesSection
      description={t("memoryEntries.userDescription")}
      entryKey={{ scope: "user" }}
      title={t("memoryEntries.userTitle")}
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

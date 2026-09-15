// Memory tab of the agent's personnel file: MEMORY.md and TASKS.md, the two
// pads the engenty keeps for itself. Both are kept PER SPACE — the same agent
// remembers different things for Marketing and for Finance — so the tab
// starts with the Space it is reading, and the pads under it are the very
// ones the desk's Manage panel shows inside that Space.
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import {
  AgentMemorySection,
  AgentTasksSection,
} from "../agent-desk/agent-memory-sections.js";
import { listHireSpaces } from "../agent-form/hire-spaces.js";

export function AgentDetailMemoryTab({
  agentId,
  editable,
}: {
  agentId: string;
  editable: boolean;
}) {
  const { t } = useTranslation("ai-ui");
  const spacesQuery = useQuery({
    queryFn: ({ signal }) => listHireSpaces(signal),
    queryKey: ["spaces", "list"],
  });
  const spaces = spacesQuery.data ?? [];
  const [spaceId, setSpaceId] = useState<string | null>(null);
  useEffect(() => {
    if (!spaceId && spaces[0]) {
      setSpaceId(spaces[0].id);
    }
  }, [spaceId, spaces]);

  if (spacesQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-muted-foreground text-sm">
          {t("agentDetail.memory.loading")}
        </CardContent>
      </Card>
    );
  }
  if (spaces.length === 0 || !spaceId) {
    return (
      <Card>
        <CardContent className="p-4 text-muted-foreground text-sm">
          {t("agentDetail.memory.noSpaces")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-muted-foreground text-xs">
          {t("agentDetail.memory.hint")}
        </p>
        <Select onValueChange={setSpaceId} value={spaceId}>
          <SelectTrigger
            aria-label={t("agentDetail.memory.space")}
            className="h-8 w-56"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spaces.map((space) => (
              <SelectItem key={space.id} value={space.id}>
                {space.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AgentMemorySection
        agentId={agentId}
        editable={editable}
        key={`memory:${spaceId}`}
        spaceId={spaceId}
      />
      <AgentTasksSection
        agentId={agentId}
        editable={editable}
        key={`tasks:${spaceId}`}
        spaceId={spaceId}
      />
    </div>
  );
}

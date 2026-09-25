import { useQuery } from "@engenty/query-client";
import { useMemo, useState } from "react";
import { useDeveloperModeEnabled } from "../../components/ag-ui-inspector/ag-ui-inspector-hooks.js";
import {
  type AiAgentEntry,
  type AiAgentToolSchemaSnapshot,
  type AiRegisteredAction,
  type AiSkillCatalogEntry,
  fetchAdminAgentToolSchemas,
} from "../../lib/admin/ai-runtime-api";
import { useAgentEffectiveCapabilitiesQuery } from "../../lib/admin/effective-capabilities-api";
import { AgentEffectiveToolRows } from "./agent-effective-tool-rows";
import {
  buildEffectiveToolRows,
  groupEffectiveToolRows,
} from "./agent-effective-tools";
import { getResolvedAgentSkillItems } from "./agent-skill-resolution";

interface AgentEffectiveToolsPanelProps {
  actions: AiRegisteredAction[];
  agent: AiAgentEntry | null;
  isLoading: boolean;
  skills: AiSkillCatalogEntry[];
  /** The Space to lay the set out for — adds the "hidden here" layer. */
  spaceId?: string | null;
  t: (key: string) => string;
}

export function AgentEffectiveToolsPanel({
  actions,
  agent,
  isLoading,
  skills,
  spaceId,
  t,
}: AgentEffectiveToolsPanelProps) {
  const devTools = useDeveloperModeEnabled();
  const [schemaOpen, setSchemaOpen] = useState<Record<string, boolean>>({});
  const capabilities = useAgentEffectiveCapabilitiesQuery({
    agentId: agent?.id,
    spaceId: spaceId ?? null,
  });

  const effectiveSkills = useMemo(() => {
    if (!agent) {
      return [];
    }
    return getResolvedAgentSkillItems({
      actions,
      agent,
      skills,
      t,
    }).effectiveSkills;
  }, [actions, agent, skills, t]);

  const toolRows = useMemo(
    () => (agent ? buildEffectiveToolRows(effectiveSkills, agent.tools) : []),
    [agent, effectiveSkills]
  );

  const groups = useMemo(
    () => groupEffectiveToolRows(toolRows, capabilities.data?.tools),
    [capabilities.data, toolRows]
  );
  const allRows = useMemo(
    () => groups.flatMap((group) => group.rows),
    [groups]
  );

  const toolIdsSorted = useMemo(
    () => [...allRows.map((r) => r.tool)].sort((a, b) => a.localeCompare(b)),
    [allRows]
  );

  const { data: schemaPayload, isFetching: schemasLoading } = useQuery({
    enabled: Boolean(agent && devTools && !isLoading && allRows.length > 0),
    queryFn: () => {
      if (!agent) {
        return Promise.resolve({ tools: [] as AiAgentToolSchemaSnapshot[] });
      }
      return fetchAdminAgentToolSchemas(agent.id, toolIdsSorted);
    },
    queryKey: [
      "admin-ai-agent-tool-schemas",
      agent?.id ?? "",
      toolIdsSorted.join("\0"),
    ],
    staleTime: 60_000,
  });

  const schemaById = useMemo(() => {
    const m = new Map<string, AiAgentToolSchemaSnapshot>();
    for (const row of schemaPayload?.tools ?? []) {
      m.set(row.tool_id, row);
    }
    return m;
  }, [schemaPayload]);

  if (!agent) {
    return (
      <p className="px-4 py-4 text-muted-foreground text-sm sm:py-5">
        {t("agents.selectHint")}
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {isLoading ? (
        <p className="px-4 py-3.5 text-muted-foreground text-xs sm:py-4">
          {t("skills.loadingActionCapabilities")}
        </p>
      ) : null}

      {!isLoading && allRows.length === 0 ? (
        <p className="px-4 py-4 text-muted-foreground text-sm sm:py-5">
          {t("skills.effectiveToolsEmpty")}
        </p>
      ) : null}

      {!isLoading && allRows.length > 0
        ? groups.map((group) => (
            <section key={group.layer}>
              {/* One heading per layer, only once the runtime said which
                  tool comes from where; before that the plain list stays. */}
              {capabilities.data ? (
                <header className="border-border border-b bg-muted/30 px-4 py-2">
                  <p className="font-medium text-xs">
                    {t(`skills.toolLayers.${group.layer}`)}
                  </p>
                  <p className="text-muted-foreground text-xxs leading-relaxed">
                    {t(`skills.toolLayers.${group.layer}Hint`)}
                  </p>
                </header>
              ) : null}
              <AgentEffectiveToolRows
                devTools={devTools}
                onToggleSchema={(tool, next) => {
                  setSchemaOpen((prev) => ({ ...prev, [tool]: next }));
                }}
                rows={group.rows}
                schemaById={schemaById}
                schemaOpen={schemaOpen}
                schemasLoading={schemasLoading}
                t={t}
              />
            </section>
          ))
        : null}
    </div>
  );
}

import { isEngentyDeveloperModeUiEnabled } from "@engenty/environment";
import { useQuery } from "@engenty/query-client";
import {
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import {
  type AiAgentEntry,
  type AiAgentToolSchemaSnapshot,
  type AiRegisteredAction,
  type AiSkillCatalogEntry,
  fetchAdminAgentToolSchemas,
} from "../../lib/admin/ai-runtime-api";
import { buildEffectiveToolRows } from "./agent-effective-tools";
import { getResolvedAgentSkillItems } from "./agent-skill-resolution";

interface AgentEffectiveToolsPanelProps {
  actions: AiRegisteredAction[];
  agent: AiAgentEntry | null;
  isLoading: boolean;
  skills: AiSkillCatalogEntry[];
  t: (key: string) => string;
}

function JsonSchemaPanel(props: {
  emptyLabel: string;
  schema: Record<string, unknown> | null | undefined;
}) {
  if (!props.schema) {
    return (
      <div className="rounded-md border border-border border-dashed bg-background/60 p-3">
        <p className="text-muted-foreground text-xs">{props.emptyLabel}</p>
      </div>
    );
  }
  return (
    <pre className="max-h-56 overflow-auto rounded-md border border-border-soft bg-muted/25 p-3 font-mono text-[11px] text-muted-foreground leading-relaxed shadow-xs">
      {JSON.stringify(props.schema, null, 2)}
    </pre>
  );
}

export function AgentEffectiveToolsPanel({
  actions,
  agent,
  isLoading,
  skills,
  t,
}: AgentEffectiveToolsPanelProps) {
  const devTools = isEngentyDeveloperModeUiEnabled();
  const [schemaOpen, setSchemaOpen] = useState<Record<string, boolean>>({});

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

  const toolIdsSorted = useMemo(
    () => [...toolRows.map((r) => r.tool)].sort((a, b) => a.localeCompare(b)),
    [toolRows]
  );

  const { data: schemaPayload, isFetching: schemasLoading } = useQuery({
    enabled: Boolean(agent && devTools && !isLoading && toolRows.length > 0),
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

      {!isLoading && toolRows.length === 0 ? (
        <p className="px-4 py-4 text-muted-foreground text-sm sm:py-5">
          {t("skills.effectiveToolsEmpty")}
        </p>
      ) : null}

      {!isLoading && toolRows.length > 0 ? (
        <ul className="m-0 list-none divide-y divide-border p-0">
          {toolRows.map((row) => {
            const snap = schemaById.get(row.tool);
            const expanded = Boolean(schemaOpen[row.tool]);
            return (
              <li className="flex flex-col" key={row.tool}>
                <div className="flex gap-3 px-4 py-3 sm:py-2.5">
                  <Wrench
                    aria-hidden
                    className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <div
                    className="min-w-0 flex-1 space-y-1"
                    title={`${row.tool}\n${row.description}`}
                  >
                    <p className="break-words font-medium font-mono text-sm leading-snug">
                      {row.tool}
                    </p>
                    <p className="break-words text-muted-foreground text-xs leading-relaxed">
                      {row.description}
                    </p>
                  </div>
                  {devTools ? (
                    <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                      <span className="text-muted-foreground text-xxs uppercase tracking-wide">
                        {t("skills.toolsSchemasToggle")}
                      </span>
                      <Switch
                        aria-label={`${row.tool} — ${t("skills.toolsSchemasToggle")}`}
                        checked={expanded}
                        onCheckedChange={(next) => {
                          setSchemaOpen((prev) => ({
                            ...prev,
                            [row.tool]: Boolean(next),
                          }));
                        }}
                      />
                    </div>
                  ) : null}
                </div>
                {devTools && expanded ? (
                  <div className="space-y-3 border-border border-t bg-muted/15 px-4 py-3 sm:px-4">
                    {schemasLoading ? (
                      <p className="text-muted-foreground text-xs">
                        {t("skills.toolsSchemasLoading")}
                      </p>
                    ) : null}
                    {!schemasLoading && snap?.description ? (
                      <div className="rounded-md border border-border-soft bg-background/70 p-3">
                        <p className="font-medium text-foreground text-xs">
                          {t("skills.toolsRuntimeDescription")}
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                          {snap.description}
                        </p>
                      </div>
                    ) : null}
                    <Tabs defaultValue="input">
                      <TabsList className="h-8 w-full justify-start">
                        <TabsTrigger className="text-xs" value="input">
                          {t("skills.toolsInputSchema")}
                        </TabsTrigger>
                        <TabsTrigger className="text-xs" value="output">
                          {t("skills.toolsOutputSchema")}
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent className="mt-2" value="input">
                        <JsonSchemaPanel
                          emptyLabel={t("skills.toolsSchemaMissing")}
                          schema={snap?.input_schema_json ?? null}
                        />
                      </TabsContent>
                      <TabsContent className="mt-2" value="output">
                        <JsonSchemaPanel
                          emptyLabel={t("skills.toolsSchemaMissing")}
                          schema={snap?.output_schema_json ?? null}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

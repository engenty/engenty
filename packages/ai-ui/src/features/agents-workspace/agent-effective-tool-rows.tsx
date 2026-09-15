import {
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { Wrench } from "lucide-react";
import type { AiAgentToolSchemaSnapshot } from "../../lib/admin/ai-runtime-api";
import type { EffectiveToolRow } from "./agent-effective-tools";

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

function ToolSchemaDetails({
  schemasLoading,
  snap,
  t,
}: {
  schemasLoading: boolean;
  snap: AiAgentToolSchemaSnapshot | undefined;
  t: (key: string) => string;
}) {
  return (
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
  );
}

export function AgentEffectiveToolRows({
  devTools,
  onToggleSchema,
  rows,
  schemaById,
  schemaOpen,
  schemasLoading,
  t,
}: {
  devTools: boolean;
  onToggleSchema: (tool: string, next: boolean) => void;
  rows: readonly EffectiveToolRow[];
  schemaById: ReadonlyMap<string, AiAgentToolSchemaSnapshot>;
  schemaOpen: Record<string, boolean>;
  schemasLoading: boolean;
  t: (key: string) => string;
}) {
  return (
    <ul className="m-0 list-none divide-y divide-border p-0">
      {rows.map((row) => {
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
                      onToggleSchema(row.tool, Boolean(next));
                    }}
                  />
                </div>
              ) : null}
            </div>
            {devTools && expanded ? (
              <ToolSchemaDetails
                schemasLoading={schemasLoading}
                snap={schemaById.get(row.tool)}
                t={t}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

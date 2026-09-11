// The workflow detail — sectioned like the agent "personnel file": identity,
// inputs, steps, run. One screen, no tabs: a module-shipped workflow
// renders read-only from the registry row.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  cn,
  DetailPageHeader,
  SettingsFormSection,
  Skeleton,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AgentIdentityRow } from "../features/agents-workspace/agent-identity-card";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildWorkflowsCatalogPath,
} from "../features/agents-workspace/agent-workspace-url-state";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useScrolledPast } from "../features/agents-workspace/use-scrolled-past";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import {
  type ActionDraft,
  createActionDraft,
  createEmptyActionDraft,
} from "../features/agents-workspace/workflow-draft";
import { formatEngentyActionSource } from "../features/agents-workspace/workflow-record-utils";
import { WorkflowRunPanel } from "../features/agents-workspace/workflow-run-panel";
import { CompactInputSchemaTable } from "../features/agents-workspace/workflow-specification-card";
import { WorkflowSyncButton } from "../features/agents-workspace/workflow-sync-button";
import { WorkflowEditor } from "../features/workflow-canvas/workflow-editor.js";
import { useMaterializeWorkflowMutation } from "../features/workflow-canvas/workflow-queries.js";
import { useAiWorkflowDetailQuery } from "../lib/admin/ai-runtime-queries";

function hasSchemaProperties(schema: Record<string, unknown>): boolean {
  const props = schema.properties;
  return Boolean(
    props &&
      typeof props === "object" &&
      !Array.isArray(props) &&
      Object.keys(props as Record<string, unknown>).length > 0
  );
}

export function WorkflowModuleDetailPage() {
  const { t } = useTranslation("ai-ui");
  const emptyValueLabel = t("workflowsDetail.notSet", {
    defaultValue: "Not set",
  });
  const { workflowId = "" } = useParams<{ workflowId?: string }>();
  const nav = useWorkspaceNavData();
  const { flows } = nav;
  const detailQuery = useAiWorkflowDetailQuery(workflowId);
  const action = detailQuery.data?.workflow ?? null;

  // The action's STEPS, inline on the same screen. An Action is one thing:
  // its declaration and the graph it compiles to are two views of it, never
  // two pages. The boot reconcile materializes module workflows, so opening
  // the page only RESOLVES the graph id (read-only server-side).
  const catalogEntry = flows.find(
    (entry) => entry.workflowId === workflowId || entry.id === workflowId
  );
  const ensureFlow = useMaterializeWorkflowMutation();
  const [compiledGraphId, setCompiledGraphId] = useState<string | null>(null);
  // Publish/Run for the steps graph — rendered in the app topbar like every
  // other page's primary action, not inside the section.
  const [stepsActions, setStepsActions] = useState<ReactNode>(null);
  const stepsGraphId = compiledGraphId ?? catalogEntry?.graph?.id ?? null;

  const ensureMutateAsync = ensureFlow.mutateAsync;
  const ensureIdle = !(ensureFlow.isPending || ensureFlow.isError);
  useEffect(() => {
    if (stepsGraphId || !(ensureIdle && workflowId)) {
      return;
    }
    ensureMutateAsync(workflowId)
      .then((compiled) => setCompiledGraphId(compiled.workflow_id))
      .catch(() => {
        // ensureFlow.isError renders the retry state.
      });
  }, [workflowId, ensureIdle, ensureMutateAsync, stepsGraphId]);

  const draft: ActionDraft = useMemo(
    () => (action ? createActionDraft(action) : createEmptyActionDraft()),
    [action]
  );
  const currentActionKey = draft.action_key.trim() || workflowId;
  // The tenant flow this module workflow reconciled into.
  const compiledFlow = useMemo(
    () => flows.find((entry) => entry.workflowId === workflowId) ?? null,
    [flows, workflowId]
  );

  const shellNav = useAgentsWorkspaceShellNav({
    ...nav,
    selectedAgentId: "",
    selectedFlowId: workflowId,
  });

  const { onScroll, scrolled } = useScrolledPast();
  // Expanded gives the canvas the whole content area: the page header and the
  // other sections step aside, and the Steps card grows to fill what is left.
  // Every element keeps its place in the tree so the editor is restyled, not
  // remounted — expanding to look closer must not drop the version you picked.
  const [stepsExpanded, setStepsExpanded] = useState(false);

  // Memoized: the topbar compares action nodes by identity, so a fresh
  // element every render would set state on every render.
  const pageActions = useMemo(
    () => (
      <>
        <WorkflowSyncButton />
        {stepsActions}
      </>
    ),
    [stepsActions]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("workflows.title"), to: buildWorkflowsCatalogPath() },
      { label: draft.name || currentActionKey },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    // Float the transparent topbar over the white header so the two read as
    // one surface; the header's `pt-14` keeps the title clear of it.
    topbarOverlap: true,
  });

  const identityRow = (label: string, value: string) => (
    <AgentIdentityRow label={label} value={value.trim() || emptyValueLabel} />
  );

  return (
    <div
      className={cn(
        "min-h-0 flex-1",
        stepsExpanded ? "flex flex-col overflow-hidden" : "overflow-y-auto"
      )}
      onScroll={onScroll}
    >
      {stepsExpanded ? null : (
        <DetailPageHeader
          collapsed={scrolled}
          description={
            <p className="max-w-4xl text-[13px] text-muted-foreground leading-relaxed">
              {draft.description || t("workflowsDetail.descriptionFallback")}
            </p>
          }
          eyebrow={
            <>
              <span className="font-medium text-foreground">
                {draft.action_key || currentActionKey}
              </span>
              <span className="mx-1.5">·</span>
              <span>{formatEngentyActionSource(draft.module_id)}</span>
            </>
          }
          maxWidth="6xl"
          status={
            <p className="max-w-xs text-right text-muted-foreground text-sm">
              {t("workflowsDetail.statusBundledReadOnly")}
            </p>
          }
          title={
            draft.name || currentActionKey || t("workflowsDetail.untitled")
          }
        />
      )}
      <div
        className={cn(
          "mx-auto w-full max-w-6xl",
          stepsExpanded ? "flex min-h-0 flex-1 flex-col p-page" : "p-page"
        )}
      >
        <div
          className={cn(
            stepsExpanded ? "flex min-h-0 flex-1 flex-col" : "space-y-6"
          )}
        >
          {stepsExpanded ? null : (
            <SettingsFormSection
              description={t("workflowsDetail.identityDescription")}
              title={t("workflowsDetail.identityTitle")}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge className="border-transparent bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                    {t("workflowsDetail.sourceSeed")}
                  </Badge>
                  {draft.module_id.trim() ? (
                    <Badge className="border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-300">
                      {t("workflowsDetail.moduleBadge", {
                        moduleId: draft.module_id,
                      })}
                    </Badge>
                  ) : null}
                </div>
                <dl className="m-0 space-y-2">
                  {identityRow(
                    t("workflowsDetail.actionKeyLabel"),
                    currentActionKey
                  )}
                  {identityRow(
                    t("workflowsDetail.agentIdLabel"),
                    draft.agent_id
                  )}
                  {identityRow(
                    t("workflowsDetail.contextTypeLabel"),
                    draft.context_type
                  )}
                  {identityRow(
                    t("workflowsDetail.skillKeysLabel"),
                    draft.skills.join(", ")
                  )}
                  {identityRow(
                    t("workflowsDetail.allowedToolsLabel"),
                    draft.allowed_tools.join(" ")
                  )}
                </dl>
              </div>
            </SettingsFormSection>
          )}

          {stepsExpanded ? null : hasSchemaProperties(
              draft.input_schema_json
            ) ? (
            <SettingsFormSection
              description={t("workflowsDetail.inputsDescription")}
              title={t("workflowsDetail.inputsTitle")}
            >
              <CompactInputSchemaTable
                labels={{
                  constraintsColumn: t(
                    "workflowsDetail.inputSchemaTableConstraints"
                  ),
                  descriptionColumn: t(
                    "workflowsDetail.inputSchemaTableDescription"
                  ),
                  propertyColumn: t("workflowsDetail.inputSchemaTableProperty"),
                  typeColumn: t("workflowsDetail.inputSchemaTableType"),
                }}
                schema={draft.input_schema_json}
              />
            </SettingsFormSection>
          ) : null}

          <SettingsFormSection
            cardClassName={cn(
              "p-0 sm:p-0",
              stepsExpanded && "flex min-h-0 flex-1 flex-col"
            )}
            className={cn(stepsExpanded && "flex min-h-0 flex-1 flex-col")}
            description={
              stepsExpanded ? null : t("workflowsDetail.stepsDescription")
            }
            title={t("workflowsDetail.stepsTab")}
          >
            {stepsGraphId ? (
              <div
                className={cn(
                  "overflow-hidden rounded-xl",
                  stepsExpanded ? "min-h-0 flex-1" : "h-[60vh] min-h-[420px]"
                )}
              >
                {/* The sections above already say what this workflow is — the
                    editor brings only the steps and the authoring toolbar. */}
                <WorkflowEditor
                  expanded={stepsExpanded}
                  graphId={stepsGraphId}
                  onPrimaryAction={setStepsActions}
                  onToggleExpanded={() => setStepsExpanded((open) => !open)}
                />
              </div>
            ) : ensureFlow.isError ? (
              <div className="space-y-3 p-6">
                <p className="text-muted-foreground text-sm">
                  {t("workflowsDetail.stepsPrepareFailed")}
                </p>
                <Button
                  onClick={() => ensureFlow.reset()}
                  size="sm"
                  type="button"
                >
                  {t("workflowsDetail.stepsRetry")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3 p-6">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-[320px] w-full" />
              </div>
            )}
          </SettingsFormSection>

          {stepsExpanded ? null : (
            <WorkflowRunPanel
              flowId={compiledFlow?.graph?.id ?? null}
              inputSchema={draft.input_schema_json}
              workflowId={workflowId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// The detail page for a workflow whose steps are a stored graph (uuid ids) —
// a workflow authored on the canvas or in chat, with no module workflow behind
// it.
//
// One workflow, ONE screen shape: the same sectioned layout as the declared
// workflow detail. The canvas (with its versions, authoring toolbar and runs
// view) is the Steps section, not a page of its own.
import { useTranslation } from "@engenty/i18n/ui";
import { cn, DetailPageHeader, SettingsFormSection } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AgentIdentityRow } from "../features/agents-workspace/agent-identity-card";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildWorkflowDetailPath,
  buildWorkflowsCatalogPath,
} from "../features/agents-workspace/agent-workspace-url-state";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useScrolledPast } from "../features/agents-workspace/use-scrolled-past";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import { formatEngentyActionSource } from "../features/agents-workspace/workflow-record-utils";
import { WorkflowEditor } from "../features/workflow-canvas/workflow-editor";
import { useWorkflowQuery } from "../features/workflow-canvas/workflow-queries";
import { WorkflowRunsSection } from "../features/workflow-canvas/workflow-runs-section";

export function WorkflowGraphDetailPage() {
  const { t } = useTranslation("ai-ui");
  // The id arrives as `:workflowId` on `/admin/engenty/workflows/:workflowId`.
  const params = useParams<{ workflowId?: string; graphId?: string }>();
  const graphId = params.graphId ?? params.workflowId ?? "";
  const nav = useWorkspaceNavData();
  const shellNav = useAgentsWorkspaceShellNav({
    ...nav,
    selectedAgentId: "",
    selectedFlowId: graphId,
  });
  const navigate = useNavigate();
  const detail = useWorkflowQuery(graphId);
  const graph = detail.data?.graph ?? null;
  const versions = detail.data?.versions ?? [];

  // A compiled module workflow is addressed by its declared id — the dotted-id page
  // is the one Action screen (its Steps section shows this same graph).
  // Legacy graph-id links land here and move on, so the uuid never becomes a
  // second address for a declared Action.
  const sourceWorkflowId = graph?.source_workflow_id ?? null;
  useEffect(() => {
    if (sourceWorkflowId) {
      navigate(buildWorkflowDetailPath(sourceWorkflowId), { replace: true });
    }
  }, [navigate, sourceWorkflowId]);

  // Publish/Run live in the app topbar with every other page's primary action.
  // WorkflowEditor owns the state that decides which button it is (selected
  // version, error count), so it hands the rendered node up.
  const [actions, setActions] = useState<ReactNode>(null);

  const statusValue =
    graph?.status === "active"
      ? t("workflowsDetail.statusActive")
      : graph?.status === "disabled"
        ? t("workflowsDetail.statusDisabled")
        : t("workflowsDetail.statusDraft");
  const versionValue = graph?.current_version
    ? `v${graph.current_version}`
    : t("workflowsDetail.versionNone");

  const { onScroll, scrolled } = useScrolledPast();
  // Expanded gives the canvas the whole content area: the page header and the
  // other sections step aside, and the Steps card grows to fill what is left.
  // Every element keeps its place in the tree so the editor is restyled, not
  // remounted — expanding to look closer must not drop the version you picked.
  const [stepsExpanded, setStepsExpanded] = useState(false);

  usePageConfig({
    actions,
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("workflows.title"), to: buildWorkflowsCatalogPath() },
      { label: graph?.title ?? graph?.name ?? graphId },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    // Float the transparent topbar over the white header so the two read as
    // one surface; the header's `pt-14` keeps the title clear of it.
    topbarOverlap: true,
  });

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
              {graph?.description || t("workflowsDetail.descriptionFallback")}
            </p>
          }
          eyebrow={
            graph?.module_id
              ? formatEngentyActionSource(graph.module_id)
              : t("workflowsDetail.sourceUser")
          }
          maxWidth="6xl"
          status={
            <p className="max-w-xs text-right text-muted-foreground text-sm">
              {graph?.module_id
                ? t("workflowsDetail.statusBundledReadOnly")
                : t("workflowsDetail.statusAuthoredAction")}
            </p>
          }
          title={graph?.title ?? graph?.name ?? graphId}
        />
      )}
      <div
        className={cn(
          "mx-auto w-full max-w-6xl p-page",
          stepsExpanded && "flex min-h-0 flex-1 flex-col"
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
              <dl className="m-0 space-y-2">
                <AgentIdentityRow
                  label={t("workflowsDetail.metaStatus")}
                  value={statusValue}
                />
                <AgentIdentityRow
                  label={t("workflowsDetail.metaVersion")}
                  value={
                    versions.length > 1
                      ? `${versionValue} · ${versions.length}`
                      : versionValue
                  }
                />
                <AgentIdentityRow
                  label={t("workflowsDetail.contextTypeLabel")}
                  value={graph?.context_type ?? t("workflowsDetail.notSet")}
                />
              </dl>
            </SettingsFormSection>
          )}

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
            <div
              className={cn(
                "overflow-hidden rounded-xl",
                stepsExpanded ? "min-h-0 flex-1" : "h-[60vh] min-h-[420px]"
              )}
            >
              <WorkflowEditor
                expanded={stepsExpanded}
                graphId={graphId}
                onPrimaryAction={setActions}
                onToggleExpanded={() => setStepsExpanded((open) => !open)}
              />
            </div>
          </SettingsFormSection>

          {stepsExpanded ? null : (
            <SettingsFormSection
              cardClassName="p-0 sm:p-0"
              description={t("workflowsDetail.runsDescription")}
              title={t("workflowsDetail.runsTitle")}
            >
              <WorkflowRunsSection graphId={graphId} />
            </SettingsFormSection>
          )}
        </div>
      </div>
    </div>
  );
}

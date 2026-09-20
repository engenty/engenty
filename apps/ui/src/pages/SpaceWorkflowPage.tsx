/**
 * `/s/<key>/workflows/<workflowId>[/runs/<runId>]` — a wizard, one step per
 * page.
 *
 * Without a run the page is page 0: the workflow's input, derived from its
 * schema; submitting starts the run and lands here with its id. With a run
 * the runner walks it: the step the run is parked on, the running step in
 * between, the outcome at the end. The run's artifacts open in the shell's
 * end pane the moment the graph presents one — until then the page is a
 * single column.
 */
import {
  spaceWorkflowPath,
  spaceWorkflowRunPath,
  WizardRunner,
  WizardStart,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { cn, uiPageScrollClassName } from "@engenty/ui-core";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { spaceRootPath } from "@/lib/space-routes";
import { useSpacesQuery } from "@/lib/spaces-queries";
import { useSpaceMentionRefSearch } from "@/lib/use-space-mention-ref-search";

/** Host key for the run's artifact pane — one pane per run, not per page. */
export function wizardArtifactPaneHostKey(runId: string): string {
  return `wizard:${runId}`;
}

export function SpaceWorkflowPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const {
    runId = "",
    spaceKey = "",
    workflowId = "",
  } = useParams<{ runId?: string; spaceKey: string; workflowId: string }>();
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () => spacesQuery.data?.find((candidate) => candidate.key === spaceKey),
    [spaceKey, spacesQuery.data]
  );
  const mentionRefSearch = useSpaceMentionRefSearch(space);

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [
      {
        href: spaceRootPath(spaceKey),
        label: space?.name ?? spaceKey,
      },
      {
        href: spaceWorkflowPath(spaceKey, workflowId),
        label: t("spaces.workflows.crumb", { defaultValue: "Workflow" }),
      },
    ],
    [space?.name, spaceKey, t, workflowId]
  );
  usePageConfig({ breadcrumbs, contentStackBackground: "paper" });

  const toPageZero = useCallback(
    () => navigate(spaceWorkflowPath(spaceKey, workflowId)),
    [navigate, spaceKey, workflowId]
  );
  const toSpaceHome = useCallback(
    () => navigate(spaceRootPath(spaceKey)),
    [navigate, spaceKey]
  );

  if (!(space?.id && workflowId)) {
    return null;
  }

  return (
    <div className={cn(uiPageScrollClassName)}>
      <div className="mx-auto w-full max-w-3xl px-page pt-7 pb-10">
        {runId ? (
          <WizardRunner
            artifactPaneHostKey={wizardArtifactPaneHostKey(runId)}
            key={runId}
            objectSearch={mentionRefSearch}
            onExit={toSpaceHome}
            onRestart={toPageZero}
            runId={runId}
          />
        ) : (
          <WizardStart
            key={workflowId}
            objectSearch={mentionRefSearch}
            onStarted={(run) =>
              navigate(spaceWorkflowRunPath(spaceKey, workflowId, run.run_id), {
                replace: true,
              })
            }
            spaceId={space.id}
            workflowId={workflowId}
          />
        )}
      </div>
    </div>
  );
}

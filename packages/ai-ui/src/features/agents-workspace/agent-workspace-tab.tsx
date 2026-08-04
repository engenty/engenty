// Workspace tab: the agent's filesystem (mount topology + file browser). The
// real successor to the legacy "Dateien" tab — the AGENTS.md/SOUL.md prompt
// layers now live in the Instructions tab, not here.

import { Badge, Card, CardContent } from "@engenty/ui-core";
import type { useAgentWorkspaceTab } from "./use-agent-workspace-tab";
import { WorkspaceFileBrowser } from "./workspace-file-browser";

interface AgentWorkspaceTabProps {
  t: (key: string) => string;
  workspace: ReturnType<typeof useAgentWorkspaceTab>;
}

export function AgentWorkspaceTab({ t, workspace }: AgentWorkspaceTabProps) {
  const { view, viewQuery } = workspace;

  if (viewQuery.isLoading) {
    return (
      <Card className="ui-canvas-elevated">
        <CardContent className="p-4 text-muted-foreground text-sm">
          {t("workspace.loading")}
        </CardContent>
      </Card>
    );
  }

  if (!view) {
    return (
      <Card className="ui-canvas-elevated">
        <CardContent className="p-4 text-muted-foreground text-sm">
          {t("workspace.notConfigured")}
        </CardContent>
      </Card>
    );
  }

  const statusBadges = (
    <>
      {view.enabled ? null : (
        <Badge variant="secondary">{t("workspace.disabled")}</Badge>
      )}
      {view.search?.bm25 ? <Badge variant="secondary">BM25</Badge> : null}
      {view.search?.vector ? (
        <Badge variant="secondary">{t("workspace.vector")}</Badge>
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-muted-foreground text-xs">
          {view.configurable
            ? t("workspace.configurableHint")
            : t("workspace.codeOwnedHint")}
        </p>
        {statusBadges}
      </div>

      {workspace.selectedMount ? (
        <WorkspaceFileBrowser t={t} workspace={workspace} />
      ) : null}
    </div>
  );
}

// Workspace tab: the agent's filesystem (mount topology + file browser). The
// real successor to the legacy "Dateien" tab — the AGENTS.md/SOUL.md prompt
// layers now live in the Instructions tab, not here.

import {
  Badge,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
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
        <CardContent className="p-5 text-muted-foreground text-sm">
          {t("workspace.loading")}
        </CardContent>
      </Card>
    );
  }

  if (!view) {
    return (
      <Card className="ui-canvas-elevated">
        <CardContent className="p-5 text-muted-foreground text-sm">
          {t("workspace.notConfigured")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-lg">{t("workspace.title")}</h2>
          <Badge variant="outline">{view.preset}</Badge>
          {view.enabled ? null : (
            <Badge variant="secondary">{t("workspace.disabled")}</Badge>
          )}
          {view.search?.bm25 ? <Badge variant="secondary">BM25</Badge> : null}
          {view.search?.vector ? (
            <Badge variant="secondary">{t("workspace.vector")}</Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          {view.configurable
            ? t("workspace.configurableHint")
            : t("workspace.codeOwnedHint")}
        </p>
      </header>

      <section className="space-y-2">
        <h3 className="font-medium text-sm">{t("workspace.mounts")}</h3>
        <Select
          onValueChange={workspace.selectMount}
          value={workspace.selectedMount ?? ""}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("workspace.selectMount")} />
          </SelectTrigger>
          <SelectContent>
            {view.mounts.map((mount) => (
              <SelectItem
                disabled={!mount.browsable}
                key={mount.path}
                value={mount.path}
              >
                <span className="font-mono">{mount.path}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {mount.scope}
                  {" · "}
                  {mount.access === "ro"
                    ? t("workspace.readOnly")
                    : t("workspace.readWrite")}
                  {mount.browsable
                    ? ""
                    : ` · ${
                        mount.requiresBinding
                          ? t("workspace.requiresBinding")
                          : t("workspace.unavailable")
                      }`}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {workspace.selectedMount ? (
        <WorkspaceFileBrowser t={t} workspace={workspace} />
      ) : null}
    </div>
  );
}

// Create/edit page for custom agents (/agents/new, /agents/:agentId/edit).
// Non-custom or module-managed agents render a read-only notice instead.

import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  type AgentDraft,
  buildAgentConfigFromDraft,
  createAgentDraft,
  createEmptyAgentDraft,
  validateAgentDraft,
} from "../features/agent-form/agent-draft";
import { AgentForm } from "../features/agent-form/agent-form";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildAgentDetailPath,
  buildAgentEditPath,
  buildAgentsCatalogPath,
} from "../features/agents-workspace/agent-workspace-paths";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import {
  useCreateCustomAgentMutation,
  useCustomAgentDetailQuery,
  useUpdateCustomAgentMutation,
} from "../lib/admin/ai-runtime-queries";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

interface EditableGuardAgent {
  managed_by_module?: string | null;
  source?: "builtin" | "module" | "database";
}

/** Only tenant-created database rows are editable; synced/builtin/module are not. */
export function isCustomEditableAgent(agent: EditableGuardAgent): boolean {
  if (agent.managed_by_module) {
    return false;
  }
  return agent.source === undefined || agent.source === "database";
}

export function AgentFormPage() {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const params = useParams();
  const agentId = params.agentId ?? null;
  const isEdit = Boolean(agentId);
  const nav = useWorkspaceNavData();
  const detailQuery = useCustomAgentDetailQuery(agentId);
  const createMutation = useCreateCustomAgentMutation();
  const updateMutation = useUpdateCustomAgentMutation();
  const [draft, setDraft] = useState<AgentDraft>(createEmptyAgentDraft);
  const [localError, setLocalError] = useState<string | null>(null);

  const agent = detailQuery.data?.agent ?? null;
  const readOnly = isEdit && agent !== null && !isCustomEditableAgent(agent);

  useEffect(() => {
    setLocalError(null);
    if (!isEdit) {
      setDraft(createEmptyAgentDraft());
      return;
    }
    if (agent) {
      setDraft(createAgentDraft(agent));
    }
  }, [agent, isEdit]);

  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });

  usePageConfig({
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("workspace.sidebarAgents"), to: buildAgentsCatalogPath() },
      {
        label: isEdit ? t("agentForm.editTitle") : t("agentForm.createTitle"),
      },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const patchDraft = useCallback((patch: Partial<AgentDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setLocalError(null);
  }, []);

  const submit = useCallback(async () => {
    const validationError = validateAgentDraft(draft);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    const config = buildAgentConfigFromDraft(draft);
    try {
      if (isEdit && agentId) {
        const result = await updateMutation.mutateAsync({
          agentId,
          patch: config,
        });
        navigate(buildAgentEditPath(result.agent.id), { replace: true });
        return;
      }
      const result = await createMutation.mutateAsync(config);
      navigate(buildAgentEditPath(result.agent.id), { replace: true });
    } catch (error) {
      setLocalError(getErrorMessage(error, t("agentForm.saveFailed")));
    }
  }, [agentId, createMutation, draft, isEdit, navigate, t, updateMutation]);

  return (
    <div className="min-h-0 flex-1 overflow-auto p-page">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <h1 className="font-semibold text-xl">
            {isEdit ? t("agentForm.editTitle") : t("agentForm.createTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("agentForm.description")}
          </p>
        </div>

        {isEdit && detailQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">
            {t("agentForm.loading")}
          </p>
        ) : null}

        {readOnly && agentId ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm">
              <ShieldAlert
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
              {agent?.managed_by_module
                ? t("agentForm.readOnlyManaged", {
                    module: agent.managed_by_module,
                  })
                : t("agentForm.readOnlyNotice")}
            </p>
            <Button asChild variant="outline">
              <Link to={buildAgentDetailPath(agentId)}>
                {t("agentForm.viewDetail")}
              </Link>
            </Button>
          </div>
        ) : null}

        {!readOnly && (!isEdit || agent) ? (
          <AgentForm
            draft={draft}
            error={localError}
            idReadOnly={isEdit}
            isSaving={createMutation.isPending || updateMutation.isPending}
            onCancel={() => navigate(buildAgentsCatalogPath())}
            onChange={patchDraft}
            onSubmit={() => void submit()}
          />
        ) : null}
      </div>
    </div>
  );
}

import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildToolCreatePath,
  buildToolEditPath,
  buildToolsPath,
} from "../features/agents-workspace/agent-workspace-paths";
import {
  buildCustomToolConfigFromDraft,
  type CustomToolDraft,
  createCustomToolDraft,
  createEmptyCustomToolDraft,
  validateCustomToolDraft,
} from "../features/agents-workspace/custom-tool-draft";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import {
  useCreateCustomToolMutation,
  useCustomToolDetailQuery,
  useDeleteCustomToolMutation,
  useUpdateCustomToolMutation,
} from "../lib/admin/ai-runtime-queries";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function ToolFormPage() {
  const { t } = useTranslation("ai-ui");
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const toolId = params.toolId ?? null;
  const isCreate = location.pathname === buildToolCreatePath();
  const isEdit = Boolean(toolId);
  const nav = useWorkspaceNavData();
  const customToolDetailQuery = useCustomToolDetailQuery(toolId);
  const createMutation = useCreateCustomToolMutation();
  const updateMutation = useUpdateCustomToolMutation();
  const deleteMutation = useDeleteCustomToolMutation();
  const [draft, setDraft] = useState<CustomToolDraft>(
    createEmptyCustomToolDraft
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingDeleteTool, setPendingDeleteTool] = useState<{
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    setLocalError(null);
    if (isCreate) {
      setDraft(createEmptyCustomToolDraft());
      return;
    }
    if (customToolDetailQuery.data?.tool) {
      setDraft(createCustomToolDraft(customToolDetailQuery.data.tool));
    }
  }, [customToolDetailQuery.data?.tool, isCreate]);

  const shellNav = useAgentsWorkspaceShellNav({
    ...nav,
    selectedAgentId: "",
  });

  usePageConfig({
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("toolsCatalog.title"), to: buildToolsPath() },
      {
        label: isCreate
          ? t("toolsCatalog.newTool")
          : t("toolsCatalog.editTool"),
      },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
  });

  const patchDraft = useCallback((patch: Partial<CustomToolDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setLocalError(null);
  }, []);

  const submit = useCallback(async () => {
    const validationError = validateCustomToolDraft(draft);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    const config = buildCustomToolConfigFromDraft(draft);
    try {
      if (isEdit && toolId) {
        const result = await updateMutation.mutateAsync({
          patch: config,
          toolId,
        });
        navigate(buildToolEditPath(result.tool.id), { replace: true });
        return;
      }
      const result = await createMutation.mutateAsync(config);
      navigate(buildToolEditPath(result.tool.id), { replace: true });
    } catch (error) {
      setLocalError(getErrorMessage(error, t("toolForm.saveFailed")));
    }
  }, [createMutation, draft, isEdit, navigate, t, toolId, updateMutation]);

  const deletePendingTool = useCallback(async () => {
    if (!pendingDeleteTool) {
      return;
    }
    const deletedToolId = pendingDeleteTool.id;
    try {
      await deleteMutation.mutateAsync(deletedToolId);
      setPendingDeleteTool(null);
      if (toolId === deletedToolId) {
        navigate(buildToolsPath(), { replace: true });
      }
    } catch (error) {
      setLocalError(getErrorMessage(error, t("toolForm.deleteFailed")));
    }
  }, [deleteMutation, navigate, pendingDeleteTool, t, toolId]);

  const showForm = isCreate || isEdit;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const deleteBusy = deleteMutation.isPending;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-page">
      <AlertDialog
        onOpenChange={(open) => !open && setPendingDeleteTool(null)}
        open={Boolean(pendingDeleteTool)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("toolsCatalog.deleteConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("toolsCatalog.deleteDescription", {
                name: pendingDeleteTool?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              {t("toolsCatalog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(event) => {
                event.preventDefault();
                void deletePendingTool();
              }}
            >
              {deleteBusy
                ? t("toolsCatalog.deleting")
                : t("toolsCatalog.actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          {t("toolForm.executionBindingNote")}
        </div>

        {localError && !showForm ? (
          <p className="text-destructive text-sm" role="alert">
            {localError}
          </p>
        ) : null}

        {showForm ? (
          <form
            className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Card className="min-h-[30rem]">
              <CardHeader className="pb-3">
                <CardTitle>{t("toolForm.schemaField")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  className="min-h-[24rem] font-mono text-sm"
                  onChange={(event) =>
                    patchDraft({ schemaJsonText: event.target.value })
                  }
                  placeholder={t("toolForm.schemaPlaceholder")}
                  spellCheck={false}
                  value={draft.schemaJsonText}
                />
              </CardContent>
            </Card>
            <div className="grid gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>{t("toolForm.detailsTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="tool-id">{t("toolForm.idField")}</Label>
                    <Input
                      autoComplete="off"
                      id="tool-id"
                      onChange={(event) =>
                        patchDraft({ id: event.target.value })
                      }
                      readOnly={isEdit}
                      value={draft.id}
                    />
                    <p className="text-muted-foreground text-xs">
                      {t("toolForm.idHint")}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tool-name">{t("toolForm.nameField")}</Label>
                    <Input
                      autoComplete="off"
                      id="tool-name"
                      onChange={(event) =>
                        patchDraft({ name: event.target.value })
                      }
                      placeholder={t("toolForm.namePlaceholder")}
                      value={draft.name}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tool-description">
                      {t("toolForm.descriptionField")}
                    </Label>
                    <Textarea
                      id="tool-description"
                      onChange={(event) =>
                        patchDraft({ description: event.target.value })
                      }
                      placeholder={t("toolForm.descriptionPlaceholder")}
                      value={draft.description}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tool-endpoint">
                      {t("toolForm.endpointField")}
                    </Label>
                    <Input
                      autoComplete="off"
                      id="tool-endpoint"
                      onChange={(event) =>
                        patchDraft({ endpointUrl: event.target.value })
                      }
                      placeholder={t("toolForm.endpointPlaceholder")}
                      value={draft.endpointUrl}
                    />
                  </div>
                </CardContent>
              </Card>
              {localError ? (
                <p className="text-destructive text-sm" role="alert">
                  {localError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => navigate(buildToolsPath())}
                  type="button"
                  variant="outline"
                >
                  {t("toolsCatalog.cancel")}
                </Button>
                <Button disabled={isSaving} type="submit">
                  {isSaving ? t("toolForm.saving") : t("toolForm.save")}
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

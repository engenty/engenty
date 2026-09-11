import { useTranslation } from "@engenty/i18n/ui";
import { DetailPageHeader } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildSkillDetailPath,
  buildSkillsCatalogPath,
} from "../features/agents-workspace/agent-workspace-url-state";
import {
  listSkillDetailFiles,
  normalizeSkillFilePath,
} from "../features/agents-workspace/skill-detail-file-entries";
import {
  buildSkillSourceFromDraft,
  createSkillDraft,
  parseSkillSourceToDraft,
  type SkillDraft,
} from "../features/agents-workspace/skill-draft";
import { SkillFilesEditor } from "../features/agents-workspace/skill-files-editor";
import {
  formatEngentySkillSource,
  getSkillModuleId,
} from "../features/agents-workspace/skill-record-utils";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import { ENGENTY_OPEN_SKILL_CREATE_MODAL } from "../features/agents-workspace/workspace-navigation-state";
import {
  useAiSkillDetailQuery,
  useAiSkillFileQuery,
  useDeleteAiSkillMutation,
  usePutAiSkillFileMutation,
  useUpdateAiSkillMutation,
} from "../lib/admin/ai-runtime-queries";

export function SkillDetailPage() {
  const { t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const { skillId } = useParams<{ skillId?: string }>();
  const [searchParams] = useSearchParams();
  const resolvedSkillId = skillId ?? "";
  const isNew = resolvedSkillId === "new";
  const nav = useWorkspaceNavData();
  const skillDetailQuery = useAiSkillDetailQuery(
    isNew ? null : resolvedSkillId
  );
  const updateMutation = useUpdateAiSkillMutation();
  const putFileMutation = usePutAiSkillFileMutation();
  const deleteMutation = useDeleteAiSkillMutation();
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [editorBody, setEditorBody] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const skill = skillDetailQuery.data?.skill ?? null;
  const fileEntries = useMemo(
    () => listSkillDetailFiles(skillDetailQuery.data?.files ?? []),
    [skillDetailQuery.data?.files]
  );
  const selectedFile =
    normalizeSkillFilePath(searchParams.get("file") ?? "SKILL.md") ||
    "SKILL.md";
  const sidecarQuery = useAiSkillFileQuery(
    isNew ? null : resolvedSkillId,
    selectedFile
  );

  useEffect(() => {
    if (!isNew) {
      return;
    }
    navigate(buildSkillsCatalogPath(), {
      replace: true,
      state: { [ENGENTY_OPEN_SKILL_CREATE_MODAL]: true },
    });
  }, [isNew, navigate]);

  useEffect(() => {
    if (searchParams.get("file") || !resolvedSkillId) {
      return;
    }
    navigate(buildSkillDetailPath(resolvedSkillId, { file: "SKILL.md" }), {
      replace: true,
    });
  }, [navigate, resolvedSkillId, searchParams]);

  useEffect(() => {
    if (isNew || !skill) {
      setDraft(null);
      return;
    }
    setDraft(createSkillDraft(skill));
    setLocalError(null);
  }, [isNew, resolvedSkillId, skill?.record_id]);

  const shellNav = useAgentsWorkspaceShellNav({
    ...nav,
    selectedSkillId: resolvedSkillId,
    selectedAgentId: "",
  });

  const canEdit = skill?.source_kind === "user";
  const currentDraft = useMemo(
    () => draft ?? (skill ? createSkillDraft(skill) : null),
    [draft, skill]
  );
  const savedBody =
    selectedFile === "SKILL.md"
      ? currentDraft
        ? buildSkillSourceFromDraft(currentDraft)
        : ""
      : (sidecarQuery.data ?? "");
  const fileReady =
    selectedFile === "SKILL.md"
      ? Boolean(currentDraft)
      : sidecarQuery.isSuccess;
  const isDirty = fileReady && editorBody !== savedBody;

  useEffect(() => {
    if (!fileReady) {
      return;
    }
    setEditorBody(savedBody);
    setLocalError(null);
  }, [fileReady, resolvedSkillId, savedBody, selectedFile]);

  const currentSkillName = currentDraft?.name.trim() || resolvedSkillId;
  const displayHeading =
    currentDraft?.title.trim() ||
    currentDraft?.name.trim() ||
    currentSkillName ||
    resolvedSkillId;
  const breadcrumbSkillLabel =
    currentDraft?.title.trim() || currentDraft?.name.trim() || resolvedSkillId;
  const headerStatusLine = skill
    ? skill.source_kind === "seed"
      ? t("skillsDetail.statusBundledReadOnly")
      : t("skillsDetail.statusCustomEditable")
    : "";
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(true);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) {
      return;
    }
    const onScroll = (event: Event) => {
      const el = event.target as HTMLElement | null;
      if (!el || typeof el.scrollTop !== "number") {
        return;
      }
      if (el.scrollHeight <= el.clientHeight) {
        return;
      }
      setHeaderCollapsed(el.scrollTop > 16);
    };
    root.addEventListener("scroll", onScroll, true);
    return () => root.removeEventListener("scroll", onScroll, true);
  }, []);

  const handleSelectFile = useCallback(
    (fileName: string) => {
      navigate(
        buildSkillDetailPath(resolvedSkillId, {
          file: normalizeSkillFilePath(fileName) || "SKILL.md",
        }),
        { replace: true }
      );
    },
    [navigate, resolvedSkillId]
  );

  async function handleSave() {
    if (!(skill && currentDraft && canEdit)) {
      return;
    }
    try {
      setLocalError(null);
      if (selectedFile === "SKILL.md") {
        let parsed: ReturnType<typeof parseSkillSourceToDraft>;
        try {
          parsed = parseSkillSourceToDraft(editorBody, currentDraft);
        } catch (error) {
          setLocalError(
            error instanceof Error
              ? error.message
              : t("skillsDetail.sourceParseFailed")
          );
          return;
        }
        const result = await updateMutation.mutateAsync({
          body_markdown: parsed.draft.body_markdown,
          description: parsed.draft.description || null,
          name: parsed.draft.name.trim(),
          skillId: resolvedSkillId,
          title: parsed.draft.title.trim() || null,
        });
        setDraft(createSkillDraft(result.skill));
        if (result.skill.name !== resolvedSkillId) {
          navigate(
            buildSkillDetailPath(result.skill.name, { file: selectedFile }),
            { replace: true }
          );
        }
        return;
      }
      await putFileMutation.mutateAsync({
        name: resolvedSkillId,
        path: selectedFile,
        text: editorBody,
      });
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : t("skillsDetail.saveFailed")
      );
    }
  }

  async function handleCreateFile(filename: string) {
    if (!canEdit) {
      return;
    }
    const path = normalizeSkillFilePath(filename);
    if (!path || path === "SKILL.md") {
      return;
    }
    setCreateError(null);
    try {
      await putFileMutation.mutateAsync({
        name: resolvedSkillId,
        path,
        text: "",
      });
      handleSelectFile(path);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : t("skillsDetail.newFileFailed")
      );
    }
  }

  usePageConfig({
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("workspace.sidebarSkills"), to: buildSkillsCatalogPath() },
      { label: breadcrumbSkillLabel },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarOverlap: true,
  });

  if (isNew) {
    return null;
  }

  const isBusy =
    updateMutation.isPending ||
    putFileMutation.isPending ||
    deleteMutation.isPending ||
    (!fileReady && selectedFile !== "SKILL.md" && sidecarQuery.isFetching);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      ref={scrollRootRef}
    >
      {skill ? (
        <>
          <DetailPageHeader
            collapsed={headerCollapsed}
            description={
              <>
                {skillDetailQuery.error ? (
                  <p className="text-destructive text-sm">
                    {skillDetailQuery.error instanceof Error
                      ? skillDetailQuery.error.message
                      : t("skillsDetail.loadFailed")}
                  </p>
                ) : null}
                <p className="text-muted-foreground text-sm">
                  {currentDraft?.description.trim() ||
                    t("skillsDetail.descriptionFallback")}
                </p>
              </>
            }
            eyebrow={
              <>
                <span className="font-medium text-foreground">
                  {currentDraft?.name ?? currentSkillName}
                </span>
                <span className="mx-1.5">·</span>
                <span>
                  {formatEngentySkillSource(
                    currentDraft?.module_id || getSkillModuleId(skill)
                  )}
                </span>
              </>
            }
            maxWidth="6xl"
            status={
              headerStatusLine ? (
                <p className="max-w-xs text-right text-muted-foreground text-sm">
                  {headerStatusLine}
                </p>
              ) : null
            }
            title={displayHeading}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-page pb-page">
            <SkillFilesEditor
              canCreate={canEdit}
              canEdit={canEdit}
              createErrorMessage={createError}
              editorBody={editorBody}
              errorMessage={
                localError ??
                (sidecarQuery.isError && selectedFile !== "SKILL.md"
                  ? sidecarQuery.error instanceof Error
                    ? sidecarQuery.error.message
                    : t("skillsDetail.fileLoadFailed")
                  : null)
              }
              files={fileEntries}
              isBusy={Boolean(isBusy)}
              isCreating={putFileMutation.isPending}
              isDeleting={deleteMutation.isPending}
              isDirty={isDirty}
              isSaving={updateMutation.isPending || putFileMutation.isPending}
              onChangeBody={(value) => {
                setEditorBody(value);
                setLocalError(null);
              }}
              onCreateFile={handleCreateFile}
              onDelete={() =>
                deleteMutation.mutate(resolvedSkillId, {
                  onSuccess: () => navigate(buildSkillsCatalogPath()),
                })
              }
              onReset={() => setEditorBody(savedBody)}
              onSave={() => void handleSave()}
              onSelectFile={handleSelectFile}
              selectedPath={selectedFile}
              t={t}
            />
          </div>
        </>
      ) : (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-page">
          {skillDetailQuery.isLoading ? (
            <p className="text-muted-foreground text-sm">
              {t("skillsCatalog.loading")}
            </p>
          ) : null}
          {skillDetailQuery.error ? (
            <p className="text-destructive text-sm">
              {skillDetailQuery.error instanceof Error
                ? skillDetailQuery.error.message
                : t("skillsDetail.loadFailed")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

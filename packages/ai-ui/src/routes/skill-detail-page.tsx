import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Code2, Eye, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { MessageResponse } from "../components/presentation.js";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildSkillDetailPath,
  buildSkillsCatalogPath,
} from "../features/agents-workspace/agent-workspace-url-state";
import { DetailMetaStat } from "../features/agents-workspace/detail-page-meta";
import { InstructionMarkdownEditor } from "../features/agents-workspace/instruction-markdown-editor";
import { SkillDetailFileChooser } from "../features/agents-workspace/skill-detail-file-chooser";
import { SkillDetailHeader } from "../features/agents-workspace/skill-detail-header";
import {
  formatSkillLicenseLabel,
  formatSkillReferenceLabel,
  formatSkillSourceLabel,
  getSkillSyncMeta,
} from "../features/agents-workspace/skill-detail-page-utils";
import { resolveSkillDetailCodePreview } from "../features/agents-workspace/skill-detail-preview";
import {
  buildSkillSourceFromDraft,
  createSkillDraft,
  getSkillDraftMetadataPayload,
  parseSkillSourceToDraft,
  type SkillDraft,
  validateSkillDraft,
} from "../features/agents-workspace/skill-draft";
import { SkillFileCodeView } from "../features/agents-workspace/skill-file-code-view";
import { SkillMarkdownFrontmatterCard } from "../features/agents-workspace/skill-markdown-frontmatter-card";
import {
  parseSkillFrontmatterPreview,
  stripMarkdownFrontmatter,
} from "../features/agents-workspace/skill-markdown-preview";
import {
  buildSkillRepoRelativePath,
  formatEngentySkillSource,
  getSkillModuleId,
} from "../features/agents-workspace/skill-record-utils";
import { SkillSourceEditor } from "../features/agents-workspace/skill-source-editor";
import { SkillSpecificationCard } from "../features/agents-workspace/skill-specification-card";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useSkillDetailStickyToolbar } from "../features/agents-workspace/use-skill-detail-sticky-toolbar";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import {
  ENGENTY_OPEN_SKILL_CREATE_MODAL,
  ENGENTY_OPEN_SKILL_DETAIL_EDIT,
  type EngentySkillsLocationState,
} from "../features/agents-workspace/workspace-navigation-state";
import {
  useAiSkillDetailQuery,
  useAiSkillsQuery,
  useDeleteAiSkillMutation,
  useUpdateAiSkillMutation,
} from "../lib/admin/ai-runtime-queries";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../lib/admin/compact-markdown-prose-classname";

export function SkillDetailPage() {
  const { i18n, t } = useTranslation("ai-ui");
  const navigate = useNavigate();
  const location = useLocation();
  const { skillId } = useParams<{ skillId?: string }>();
  const [searchParams] = useSearchParams();
  const resolvedSkillId = skillId ?? "";
  const isNew = resolvedSkillId === "new";
  const nav = useWorkspaceNavData();
  const skillsQuery = useAiSkillsQuery();
  const skillDetailQuery = useAiSkillDetailQuery(
    isNew ? null : resolvedSkillId
  );
  const updateMutation = useUpdateAiSkillMutation();
  const deleteMutation = useDeleteAiSkillMutation();
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");
  const skill = skillDetailQuery.data?.skill ?? null;
  const skillFiles = skillDetailQuery.data?.files ?? [];
  const selectedFile = searchParams.get("file") ?? "SKILL.md";
  const skillDetailViewIsCode = searchParams.get("view") === "code";
  const skillDetailTabValue = skillDetailViewIsCode ? "code" : "view";
  const skillDetailStickyLayoutKey = `${resolvedSkillId}-${skillDetailTabValue}-${isEditing ? 1 : 0}-${skill?.record_id ?? ""}-${skillFiles.length}`;
  const {
    placeholderHeight,
    pinned,
    scrollRef,
    sentinelRef,
    toolbarRef,
    toolbarStyle,
  } = useSkillDetailStickyToolbar(skillDetailStickyLayoutKey);

  const consumedEditIntentRef = useRef(false);

  useEffect(() => {
    consumedEditIntentRef.current = false;
  }, [resolvedSkillId]);

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

    navigate(
      buildSkillDetailPath(resolvedSkillId, {
        file: "SKILL.md",
        view: skillDetailViewIsCode ? "code" : null,
      }),
      {
        replace: true,
      }
    );
  }, [navigate, resolvedSkillId, searchParams, skillDetailViewIsCode]);

  useEffect(() => {
    if (isNew) {
      return;
    }

    if (!skill) {
      setDraft(null);
      setSourceText("");
      return;
    }

    const nextDraft = createSkillDraft(skill);
    setDraft(nextDraft);
    setSourceText(buildSkillSourceFromDraft(nextDraft));
    setLocalError(null);
    setSourceError(null);

    const locState = location.state as EngentySkillsLocationState | null;
    const wantEdit =
      Boolean(locState?.[ENGENTY_OPEN_SKILL_DETAIL_EDIT]) &&
      !consumedEditIntentRef.current;

    if (wantEdit) {
      consumedEditIntentRef.current = true;
      setIsEditing(true);
      navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true, state: {} }
      );
    } else if (!consumedEditIntentRef.current) {
      setIsEditing(false);
    }
  }, [isNew, resolvedSkillId, skill?.record_id, location.state, navigate]);

  const navSkills = useMemo(
    () =>
      (skillsQuery.data?.skills ?? []).toSorted((left, right) =>
        `${getSkillModuleId(left)}:${left.name}`.localeCompare(
          `${getSkillModuleId(right)}:${right.name}`
        )
      ),
    [skillsQuery.data?.skills]
  );

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
  const headerStatusLine = useMemo(() => {
    if (!skill) {
      return "";
    }
    if (skill.source_kind === "seed") {
      return t("skillsDetail.statusBundledReadOnly");
    }
    return t("skillsDetail.statusCustomEditable");
  }, [skill, t]);
  const currentSkillName = currentDraft?.name.trim() || resolvedSkillId;
  const displayHeading =
    currentDraft?.title.trim() ||
    currentDraft?.name.trim() ||
    currentSkillName ||
    resolvedSkillId;
  const breadcrumbSkillLabel =
    currentDraft?.title.trim() || currentDraft?.name.trim() || resolvedSkillId;
  const selectedFileRecord = useMemo(
    () =>
      skillFiles.find((file) => file.logical_path === selectedFile) ??
      skillFiles[0] ??
      null,
    [selectedFile, skillFiles]
  );
  const codePreview = resolveSkillDetailCodePreview({
    draft: currentDraft,
    isEditing,
    selectedFile,
    selectedFileContentText: selectedFileRecord?.content_text,
    sourceText,
  });
  const renderedMarkdownPreview = useMemo(
    () => stripMarkdownFrontmatter(codePreview || ""),
    [codePreview]
  );
  const frontmatterPreviewModel = useMemo(
    () => parseSkillFrontmatterPreview(codePreview || ""),
    [codePreview]
  );
  const skillRepoDisplayPath = useMemo(() => {
    const skillName = (
      currentDraft?.name ??
      skill?.name ??
      resolvedSkillId
    ).trim();
    if (!skillName) {
      return null;
    }
    const effectiveModuleId =
      currentDraft?.module_id.trim() ||
      (skill ? getSkillModuleId(skill) : "engenty-core");
    return buildSkillRepoRelativePath({
      logicalPath: selectedFile,
      moduleId: effectiveModuleId,
      skillName,
    });
  }, [
    currentDraft?.module_id,
    currentDraft?.name,
    resolvedSkillId,
    selectedFile,
    skill,
  ]);
  const syncMeta = getSkillSyncMeta(skill, t);
  const licenseMetaLabel = useMemo(() => {
    const translated = t("skillsDetail.metaLicense");
    if (translated !== "skillsDetail.metaLicense") {
      return translated;
    }
    return i18n.language?.startsWith("de") ? "Lizenz" : "License";
  }, [i18n.language, t]);
  const draftValidationError = useMemo(() => {
    if (!(isEditing && currentDraft)) {
      return null;
    }
    return validateSkillDraft(currentDraft);
  }, [currentDraft, isEditing]);

  const updateDraft = useCallback(
    (updater: (current: SkillDraft) => SkillDraft) => {
      setDraft((current) => {
        if (!current) {
          return current;
        }
        const next = updater(current);
        setSourceText(buildSkillSourceFromDraft(next));
        setLocalError(null);
        setSourceError(null);
        return next;
      });
    },
    []
  );

  async function handleSave() {
    if (!(skill && currentDraft)) {
      return;
    }
    if (sourceError) {
      setLocalError(t("skillsDetail.sourceParseFailed"));
      return;
    }
    const validationError = draftValidationError;
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    try {
      setLocalError(null);
      const metadataPayload = getSkillDraftMetadataPayload(
        currentDraft.metadata_rows
      );
      const result = await updateMutation.mutateAsync({
        allowed_tools: currentDraft.allowed_tools,
        body_markdown: currentDraft.body_markdown,
        compatibility: currentDraft.compatibility || null,
        description: currentDraft.description || null,
        license: currentDraft.license || null,
        metadata: {
          ...metadataPayload.metadata,
          module_id: currentDraft.module_id.trim() || "engenty-core",
        },
        metadata_order: metadataPayload.metadata_order,
        name: currentDraft.name.trim(),
        skillId: resolvedSkillId,
        title: currentDraft.title.trim() || null,
      });
      const nextDraft = createSkillDraft(result.skill);
      setDraft(nextDraft);
      setSourceText(buildSkillSourceFromDraft(nextDraft));
      if (result.skill.name !== resolvedSkillId) {
        navigate(
          buildSkillDetailPath(result.skill.name, {
            file: selectedFile,
            view: skillDetailViewIsCode ? "code" : null,
          }),
          { replace: true }
        );
      }
      setIsEditing(false);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : t("skillsDetail.saveFailed")
      );
    }
  }

  function handleCancel() {
    setLocalError(null);
    if (skill) {
      const nextDraft = createSkillDraft(skill);
      setDraft(nextDraft);
      setSourceText(buildSkillSourceFromDraft(nextDraft));
    }
    setSourceError(null);
    setIsEditing(false);
  }

  usePageConfig({
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("workspace.sidebarSkills"), to: buildSkillsCatalogPath() },
      { label: breadcrumbSkillLabel },
    ],
    actions: canEdit ? (
      isEditing ? (
        <>
          <Button
            onClick={handleCancel}
            size="xs"
            type="button"
            variant="outline"
          >
            {t("skillsDetail.cancel")}
          </Button>
          <Button
            disabled={updateMutation.isPending}
            onClick={() => void handleSave()}
            size="xs"
            type="button"
          >
            {updateMutation.isPending ? t("actions.saving") : t("actions.save")}
          </Button>
        </>
      ) : (
        <Button
          onClick={() => setIsEditing(true)}
          size="xs"
          type="button"
          variant="outline"
        >
          <Pencil aria-hidden className="mr-2 size-4" />
          {t("skillsDetail.edit")}
        </Button>
      )
    ) : null,
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const handleSelectFile = useCallback(
    (fileName: string) => {
      navigate(
        buildSkillDetailPath(resolvedSkillId, {
          file: fileName,
          view: skillDetailViewIsCode ? "code" : null,
        }),
        {
          replace: true,
        }
      );
    },
    [navigate, resolvedSkillId, skillDetailViewIsCode]
  );

  const handleSkillDetailTabChange = useCallback(
    (next: string) => {
      navigate(
        buildSkillDetailPath(resolvedSkillId, {
          file: selectedFile,
          view: next === "code" ? "code" : null,
        }),
        { replace: true }
      );
    },
    [navigate, resolvedSkillId, selectedFile]
  );

  if (isNew) {
    return null;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
      {skill ? (
        <Tabs
          className="flex min-h-0 w-full flex-col"
          onValueChange={handleSkillDetailTabChange}
          value={skillDetailTabValue}
        >
          <header className="w-full shrink-0 border-b bg-muted/30">
            <div className="mx-auto max-w-6xl px-4 pt-4 pb-0 md:px-5">
              <div className="space-y-4 pb-4">
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

                <SkillDetailHeader
                  description={currentDraft?.description ?? ""}
                  descriptionFallback={t("skillsDetail.descriptionFallback")}
                  descriptionPlaceholder={t(
                    "skillsDetail.descriptionPlaceholder"
                  )}
                  displayHeading={displayHeading}
                  headerStatusLine={headerStatusLine}
                  isEditing={isEditing}
                  moduleLabel={formatEngentySkillSource(
                    currentDraft?.module_id || getSkillModuleId(skill)
                  )}
                  name={currentDraft?.name ?? ""}
                  onDescriptionChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      description: value,
                    }))
                  }
                  onTitleChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      title: value,
                    }))
                  }
                  statusFallbackName={currentSkillName}
                  title={currentDraft?.title ?? ""}
                  titlePlaceholder={t("skillsDetail.titlePlaceholder")}
                />

                <div className="grid gap-x-6 gap-y-3 pt-2 md:grid-cols-2 xl:grid-cols-4">
                  <DetailMetaStat
                    label={t("skillsDetail.metaSource")}
                    value={formatSkillSourceLabel(skill, t)}
                  />
                  <DetailMetaStat
                    label={t("skillsDetail.metaReference")}
                    value={formatSkillReferenceLabel(skill, t)}
                  />
                  <DetailMetaStat
                    label={licenseMetaLabel}
                    value={formatSkillLicenseLabel(skill, t)}
                  />
                  {syncMeta ? (
                    <DetailMetaStat
                      label={syncMeta.label}
                      value={syncMeta.value}
                    />
                  ) : null}
                  {skill?.has_tenant_override ? (
                    <DetailMetaStat
                      label={t("skillsDetail.metaOverrideStatus")}
                      value={t("skillsDetail.overrideStatusTenant")}
                    />
                  ) : null}
                </div>

                {(localError ?? draftValidationError) ? (
                  <div
                    className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
                    role="alert"
                  >
                    {localError ?? draftValidationError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="w-full shrink-0">
              <div aria-hidden className="h-0" ref={sentinelRef} />
              {placeholderHeight > 0 ? (
                <div aria-hidden style={{ height: placeholderHeight }} />
              ) : null}
              <div
                className={cn(
                  "flex items-end justify-between gap-4 pb-px",
                  pinned
                    ? "border-border border-b bg-background px-4 py-1 shadow-sm md:px-5"
                    : "mx-auto max-w-6xl px-4 md:px-5"
                )}
                ref={toolbarRef}
                style={toolbarStyle}
              >
                <SkillDetailFileChooser
                  chooseFileAriaLabel={t("skillsDetail.fileChooserAriaLabel")}
                  className="min-w-0 flex-1"
                  files={skillFiles.map((file) => ({
                    label: file.logical_path,
                    path: file.logical_path,
                  }))}
                  onSelectFile={handleSelectFile}
                  selectedFile={selectedFile}
                />
                <TabsList
                  className="-mb-px h-9 w-fit border-0 bg-transparent p-0"
                  variant="line"
                >
                  <TabsTrigger className="flex-none" value="view">
                    <Eye aria-hidden className="mr-2 size-4" />
                    {t("skillsDetail.viewTab")}
                  </TabsTrigger>
                  <TabsTrigger className="flex-none" value="code">
                    <Code2 aria-hidden className="mr-2 size-4" />
                    {t("skillsDetail.codeTab")}
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </header>

          <div className="mx-auto w-full max-w-6xl space-y-6 p-page">
            <TabsContent className="m-0 block flex-none" value="view">
              {isEditing && currentDraft ? (
                <SkillSpecificationCard
                  draft={currentDraft}
                  labels={{
                    allowedTools: t("skillsDetail.previewAllowedToolsHeading"),
                    compatibility: t("skillsDetail.compatibilityLabel"),
                    description: t("skillsDetail.descriptionLabel"),
                    license: licenseMetaLabel,
                    metadata: t("skillsDetail.previewMetadataHeading"),
                    name: t("skillsDetail.nameLabel"),
                    title: t("skillsDetail.titleLabel"),
                  }}
                  nameHint={t("skillsDetail.nameKebabHint")}
                  onAllowedToolsChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      allowed_tools: value
                        .split(/\s+/u)
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    }))
                  }
                  onCompatibilityChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      compatibility: value,
                    }))
                  }
                  onDescriptionChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      description: value,
                    }))
                  }
                  onLicenseChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      license: value,
                    }))
                  }
                  onMetadataChange={(index, value) =>
                    updateDraft((current) => ({
                      ...current,
                      metadata_rows: current.metadata_rows.map(
                        (entry, entryIndex) =>
                          entryIndex === index ? { ...entry, value } : entry
                      ),
                    }))
                  }
                  onNameChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      name: value,
                    }))
                  }
                  onTitleChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      title: value,
                    }))
                  }
                />
              ) : frontmatterPreviewModel ? (
                <SkillMarkdownFrontmatterCard
                  labels={{
                    allowedTools: t("skillsDetail.previewAllowedToolsHeading"),
                    metadata: t("skillsDetail.previewMetadataHeading"),
                  }}
                  model={frontmatterPreviewModel}
                />
              ) : null}
              {isEditing && currentDraft ? (
                <InstructionMarkdownEditor
                  mode="wysiwyg"
                  onChange={(markdown) =>
                    updateDraft((current) => ({
                      ...current,
                      body_markdown: markdown,
                    }))
                  }
                  placeholder={t("skillsDetail.editorPlaceholder")}
                  toolbarVariant="floating"
                  value={currentDraft.body_markdown}
                />
              ) : (
                <MessageResponse className={COMPACT_MARKDOWN_PROSE_CLASSNAME}>
                  {renderedMarkdownPreview}
                </MessageResponse>
              )}
              {isEditing && canEdit ? (
                <section className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <h2 className="font-medium text-destructive text-sm">
                        {t("skillsDetail.dangerZoneTitle")}
                      </h2>
                      <p className="text-muted-foreground text-sm">
                        {t("skillsDetail.dangerZoneDescription")}
                      </p>
                    </div>
                    <Button
                      disabled={deleteMutation.isPending}
                      onClick={() =>
                        deleteMutation.mutate(resolvedSkillId, {
                          onSuccess: () => navigate(buildSkillsCatalogPath()),
                        })
                      }
                      type="button"
                      variant="destructive"
                    >
                      {t("skillsCatalog.delete")}
                    </Button>
                  </div>
                </section>
              ) : null}
            </TabsContent>

            <TabsContent className="m-0 block flex-none" value="code">
              {skillRepoDisplayPath ? (
                <p className="mb-2 break-all font-mono text-muted-foreground text-xs italic">
                  {skillRepoDisplayPath}
                </p>
              ) : null}
              {isEditing && currentDraft ? (
                <div className="grid gap-3">
                  {sourceError ? (
                    <div
                      className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
                      role="alert"
                    >
                      {t("skillsDetail.sourceParseFailed")}: {sourceError}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {t("skillsDetail.sourceEditorHint")}
                    </p>
                  )}
                  <SkillSourceEditor
                    formatLabel={t("skillsDetail.formatSource")}
                    onChange={(nextValue) => {
                      setSourceText(nextValue);
                      if (!currentDraft) {
                        return;
                      }
                      try {
                        const parsed = parseSkillSourceToDraft(
                          nextValue,
                          currentDraft
                        );
                        setDraft(parsed.draft);
                        setSourceError(null);
                      } catch (error) {
                        setSourceError(
                          error instanceof Error
                            ? error.message
                            : t("skillsDetail.sourceParseFailed")
                        );
                      }
                    }}
                    searchLabel={t("skillsDetail.searchSource")}
                    value={sourceText}
                  />
                </div>
              ) : (
                <SkillFileCodeView
                  content={codePreview}
                  filePath={selectedFile}
                />
              )}
            </TabsContent>
          </div>
        </Tabs>
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

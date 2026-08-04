import { useTranslation } from "@engenty/i18n/ui";
import { cn, Tabs, TabsContent, TabsList, TabsTrigger } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Code2, Eye } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MessageResponse } from "../components/presentation.js";
import { ActionDetailHeader } from "../features/agents-workspace/action-detail-header";
import {
  type ActionDraft,
  buildActionSourceFromDraft,
  createActionDraft,
  createEmptyActionDraft,
} from "../features/agents-workspace/action-draft";
import { formatEngentyActionSource } from "../features/agents-workspace/action-record-utils";
import { ActionRunPanel } from "../features/agents-workspace/action-run-panel";
import { ActionSpecificationCard } from "../features/agents-workspace/action-specification-card";
import {
  AGENTS_WORKSPACE_ROOT_PATH,
  buildActionDetailPath,
  buildActionsCatalogPath,
} from "../features/agents-workspace/agent-workspace-url-state";
import {
  DetailMetaStat,
  formatDetailTimestamp,
} from "../features/agents-workspace/detail-page-meta";
import { SkillDetailFileChooser } from "../features/agents-workspace/skill-detail-file-chooser";
import { SkillFileCodeView } from "../features/agents-workspace/skill-file-code-view";
import { stripMarkdownFrontmatter } from "../features/agents-workspace/skill-markdown-preview";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useSkillDetailStickyToolbar } from "../features/agents-workspace/use-skill-detail-sticky-toolbar";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import { useAiActionDetailQuery } from "../lib/admin/ai-runtime-queries";
import { COMPACT_MARKDOWN_PROSE_CLASSNAME } from "../lib/admin/compact-markdown-prose-classname";

export function ActionDetailPage() {
  const { t } = useTranslation("ai-ui");
  const emptyValueLabel = t("actionsDetail.notSet", {
    defaultValue: "Not set",
  });
  const navigate = useNavigate();
  const { actionId = "" } = useParams<{ actionId?: string }>();
  const [searchParams] = useSearchParams();
  const nav = useWorkspaceNavData();
  const detailQuery = useAiActionDetailQuery(actionId);
  const action = detailQuery.data?.action ?? null;
  const files = detailQuery.data?.files ?? [];
  const selectedFile = searchParams.get("file") ?? "ACTION.md";
  const tabValue = searchParams.get("view") === "code" ? "code" : "view";
  const draft: ActionDraft = useMemo(
    () => (action ? createActionDraft(action) : createEmptyActionDraft()),
    [action]
  );
  const layoutKey = `${actionId}-${tabValue}-${files.length}`;
  const {
    pinned,
    placeholderHeight,
    scrollRef,
    sentinelRef,
    toolbarRef,
    toolbarStyle,
  } = useSkillDetailStickyToolbar(layoutKey);

  const currentActionKey = draft.action_key.trim() || actionId;
  const selectedFileRecord =
    files.find((file) => file.logical_path === selectedFile) ?? null;
  const codePreview =
    selectedFileRecord?.content_text ?? buildActionSourceFromDraft(draft);
  const renderedMarkdownPreview = useMemo(
    () => stripMarkdownFrontmatter(codePreview),
    [codePreview]
  );
  const shellNav = useAgentsWorkspaceShellNav({
    ...nav,
    selectedActionId: actionId,
    selectedAgentId: "",
  });

  const syncMetaValue =
    action?.source_kind === "user"
      ? formatDetailTimestamp(action.updated_at)
      : (formatDetailTimestamp(action?.last_seeded_at ?? null) ??
        formatDetailTimestamp(action?.last_synced_at ?? null));

  usePageConfig({
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("workspace.sidebarActions"), to: buildActionsCatalogPath() },
      { label: draft.name || currentActionKey },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
      <Tabs
        className="flex min-h-0 w-full flex-col"
        onValueChange={(next) => {
          navigate(
            buildActionDetailPath(actionId, {
              file: selectedFile,
              view: next === "code" ? "code" : null,
            }),
            { replace: true }
          );
        }}
        value={tabValue}
      >
        <header className="w-full shrink-0 bg-card">
          <div className="mx-auto max-w-6xl px-4 pt-4 pb-0 md:px-5">
            <div className="space-y-4 pb-2">
              <ActionDetailHeader
                actionKey={draft.action_key}
                description={draft.description}
                descriptionFallback={t("actionsDetail.descriptionFallback")}
                descriptionPlaceholder={t(
                  "actionsDetail.descriptionPlaceholder"
                )}
                headerStatusLine={
                  action?.source_kind === "user"
                    ? t("actionsDetail.statusCustomEditable")
                    : t("actionsDetail.statusBundledReadOnly")
                }
                isEditing={false}
                moduleLabel={formatEngentyActionSource(draft.module_id)}
                name={draft.name}
                onDescriptionChange={() => undefined}
                onNameChange={() => undefined}
                statusFallbackName={
                  currentActionKey || t("actionsCatalog.create")
                }
              />
              <div className="grid gap-x-6 gap-y-3 pt-2 md:grid-cols-2 xl:grid-cols-4">
                <DetailMetaStat
                  label={t("actionsDetail.metaSource")}
                  value={
                    action?.source_kind === "user"
                      ? t("actionsDetail.sourceUser")
                      : t("actionsDetail.sourceSeed")
                  }
                />
                <DetailMetaStat
                  label={t("actionsDetail.metaReference")}
                  value={action?.source_reference || draft.module_id}
                />
                <DetailMetaStat
                  label={t("actionsDetail.metaMode")}
                  value={draft.default_thread_mode}
                />
                {syncMetaValue ? (
                  <DetailMetaStat
                    label={t("actionsDetail.metaLastSynced")}
                    value={syncMetaValue}
                  />
                ) : null}
              </div>
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
                  ? "border-border border-b bg-card px-4 py-1 shadow-sm md:px-5"
                  : "mx-auto max-w-6xl px-4 md:px-5"
              )}
              ref={toolbarRef}
              style={toolbarStyle}
            >
              <SkillDetailFileChooser
                chooseFileAriaLabel={t("actionsDetail.fileChooserAriaLabel")}
                className="min-w-0 flex-1"
                files={[
                  ...(files.length > 0
                    ? files
                    : [{ logical_path: "ACTION.md" } as never]),
                ].map((file) => ({
                  label: file.logical_path,
                  path: file.logical_path,
                }))}
                onSelectFile={(fileName) =>
                  navigate(
                    buildActionDetailPath(actionId, {
                      file: fileName,
                      view: tabValue === "code" ? "code" : null,
                    }),
                    { replace: true }
                  )
                }
                selectedFile={selectedFile}
              />
              <TabsList
                className="-mb-px h-9 w-fit border-0 bg-transparent p-0"
                variant="line"
              >
                <TabsTrigger className="flex-none" value="view">
                  <Eye className="mr-2 size-4" />
                  {t("actionsDetail.viewTab")}
                </TabsTrigger>
                <TabsTrigger className="flex-none" value="code">
                  <Code2 className="mr-2 size-4" />
                  {t("actionsDetail.codeTab")}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
        </header>
        <div className="mx-auto w-full max-w-6xl p-page">
          <div className="rounded-xl bg-card shadow-sm">
            <TabsContent className="m-0 block flex-none p-6" value="view">
              <div className="space-y-6">
                <ActionSpecificationCard
                  draft={draft}
                  isEditing={false}
                  labels={{
                    actionKey: t("actionsDetail.actionKeyLabel"),
                    agentId: t("actionsDetail.agentIdLabel"),
                    contextType: t("actionsDetail.contextTypeLabel"),
                    defaultThreadMode: t(
                      "actionsDetail.defaultThreadModeLabel"
                    ),
                    moduleId: t("actionsDetail.moduleIdLabel"),
                    notSet: emptyValueLabel,
                  }}
                  onActionKeyChange={() => undefined}
                  onAgentIdChange={() => undefined}
                  onContextTypeChange={() => undefined}
                  onDefaultThreadModeChange={() => undefined}
                  readonlyExtensions={{
                    constraintsColumn: t(
                      "actionsDetail.inputSchemaTableConstraints",
                      { defaultValue: "Constraints" }
                    ),
                    descriptionColumn: t(
                      "actionsDetail.inputSchemaTableDescription",
                      { defaultValue: "Description" }
                    ),
                    inputSchemaLabel: t("actionsDetail.inputSchemaLabel"),
                    instructionKeysLabel: t(
                      "actionsDetail.instructionKeysLabel"
                    ),
                    notSet: emptyValueLabel,
                    propertyColumn: t(
                      "actionsDetail.inputSchemaTableProperty",
                      {
                        defaultValue: "Property",
                      }
                    ),
                    skillKeysLabel: t("actionsDetail.skillKeysLabel"),
                    allowedToolsLabel: t("actionsDetail.allowedToolsLabel"),
                    typeColumn: t("actionsDetail.inputSchemaTableType", {
                      defaultValue: "Type",
                    }),
                  }}
                />
                <MessageResponse className={COMPACT_MARKDOWN_PROSE_CLASSNAME}>
                  {renderedMarkdownPreview}
                </MessageResponse>
                <ActionRunPanel
                  actionId={actionId}
                  defaultThreadMode={draft.default_thread_mode}
                  inputSchema={draft.input_schema_json}
                />
              </div>
            </TabsContent>
            <TabsContent className="m-0 block flex-none p-6" value="code">
              <SkillFileCodeView
                content={codePreview}
                filePath={selectedFile}
              />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

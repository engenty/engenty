/**
 * Space markdown artifact: reader by default, Edit for slash/block editing.
 *
 * Save writes a new `ai.artifact_version`. Knowledge Base chrome (comments,
 * publish, sources) stays on `kb.article` when that module is mounted.
 */
import {
  type ArtifactSummary,
  type ArtifactVersionSummary,
  artifactsQueryRoot,
  MarkdownDocumentEditor,
  useMarkdownReadingStyle,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { useQueryClient } from "@engenty/query-client";
import {
  Button,
  Spinner,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { requestAiJson } from "@/lib/api/client";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import { useMarkdownPageOverflow } from "./markdown-page-overflow";
import { MarkdownPageProperties } from "./markdown-page-properties";
import { PaneChrome } from "./pane-chrome";

export function MarkdownPage({
  artifact,
  breadcrumbs,
  content,
  onClose,
  spaceId,
  version,
}: {
  artifact: ArtifactSummary;
  breadcrumbs: PageBreadcrumb[];
  content: string;
  onClose: () => void;
  spaceId?: string | null;
  version: ArtifactVersionSummary;
}) {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { readingStyle, setReadingStyle } = useMarkdownReadingStyle();
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [draft, setDraft] = useState(content);
  const [titleDraft, setTitleDraft] = useState(artifact.title);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(content);
    setTitleDraft(artifact.title);
    setError(null);
  }, [artifact.title, content, artifact.current_version]);

  useEffect(() => {
    if (searchParams.get("edit") === "1") {
      setEditing(true);
    }
  }, [searchParams]);

  const dirty = draft !== content || titleDraft !== artifact.title;

  const save = useCallback(() => {
    const nextTitle = titleDraft.trim() || artifact.title;
    setSaving(true);
    setError(null);
    void requestAiJson(
      `/ai/artifacts/${encodeURIComponent(artifact.id)}/versions`,
      {
        body: {
          content: draft,
          expected_version: artifact.current_version,
          summary: "Edited in Space Data",
          title: nextTitle,
        },
        method: "POST",
      }
    )
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: artifactsQueryRoot });
        if (spaceId) {
          void queryClient.invalidateQueries({
            queryKey: spaceDriveKeys.artifacts(spaceId),
          });
        }
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : t("spaces.data.saveFailed", { defaultValue: "Save failed." })
        );
      })
      .finally(() => setSaving(false));
  }, [
    artifact.current_version,
    artifact.id,
    artifact.title,
    draft,
    queryClient,
    spaceId,
    t,
    titleDraft,
  ]);

  const cancelEdit = useCallback(() => {
    setDraft(content);
    setTitleDraft(artifact.title);
    setError(null);
    setEditing(false);
  }, [artifact.title, content]);

  const overflowLabels = useMemo(
    () => ({
      cancel: t("actions.cancel"),
      copyContent: t("spaces.data.page.copyContent"),
      copyContentFailed: t("spaces.data.page.copyContentFailed"),
      copyContentSuccess: t("spaces.data.page.copyContentSuccess"),
      copyLink: t("spaces.data.page.copyLink"),
      current: t("spaces.data.page.historyCurrent"),
      delete: t("spaces.data.page.delete"),
      deleteConfirm: t("spaces.data.page.deleteConfirm"),
      deleteDescription: t("spaces.data.page.deleteDescription"),
      deleteFailed: t("spaces.data.page.deleteFailed"),
      deleteTitle: t("spaces.data.page.deleteTitle"),
      deleted: t("spaces.data.page.deleted"),
      duplicate: t("spaces.data.page.duplicate"),
      duplicateDone: t("spaces.data.page.duplicateDone"),
      duplicateFailed: t("spaces.data.page.duplicateFailed"),
      duplicateSuffix: t("spaces.data.page.duplicateSuffix"),
      exportMarkdown: t("spaces.data.page.exportMarkdown"),
      history: t("spaces.data.page.history"),
      historyEmpty: t("spaces.data.page.historyEmpty"),
      linkCopied: t("spaces.data.page.linkCopied"),
      linkCopyFailed: t("spaces.data.page.linkCopyFailed"),
      move: t("spaces.data.page.move"),
      moveDescription: t("spaces.data.page.moveDescription"),
      moveFailed: t("spaces.data.page.moveFailed"),
      moveHere: t("spaces.data.page.moveHere"),
      moveTitle: t("spaces.data.page.moveTitle"),
      moved: t("spaces.data.page.moved"),
      print: t("spaces.data.page.print"),
      printHint: t("spaces.data.page.printHint"),
      readingLarge: t("spaces.data.page.readingLarge"),
      readingNormal: t("spaces.data.page.readingNormal"),
      readingTone: t("spaces.data.page.readingTone"),
      root: t("spaces.data.page.root"),
    }),
    [t]
  );

  const { dialogs, menuItems } = useMarkdownPageOverflow({
    artifact,
    content: draft,
    labels: overflowLabels,
    onClose,
    readingStyle,
    setReadingStyle,
    spaceId,
  });

  const actions = useMemo(() => {
    if (editing) {
      return (
        <div className="flex items-center gap-1">
          <Button
            className={topbarIconButtonClassName}
            onClick={cancelEdit}
            size="sm"
            type="button"
            variant="ghost"
          >
            <TopbarActionLabel>{t("actions.cancel")}</TopbarActionLabel>
          </Button>
          <Button disabled={!dirty || saving} onClick={save} size="sm">
            {saving ? <Spinner className="size-3" /> : null}
            {t("actions.save")}
          </Button>
        </div>
      );
    }
    return (
      <Button
        className={topbarIconButtonClassName}
        onClick={() => setEditing(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Pencil aria-hidden className="h-4 w-4" />
        <TopbarActionLabel>{t("actions.edit")}</TopbarActionLabel>
      </Button>
    );
  }, [cancelEdit, dirty, editing, save, saving, t]);

  const properties = (
    <MarkdownPageProperties
      createdAt={artifact.created_at}
      createdBy={artifact.created_by}
      createdByKind={artifact.created_by_kind}
      labels={{
        agent: t("spaces.data.page.agent"),
        created: t("spaces.data.page.created"),
        lastEdited: t("spaces.data.page.lastEdited"),
        parent: t("spaces.data.page.parent"),
        root: t("spaces.data.page.root"),
        type: t("spaces.data.page.type"),
        typeMarkdown: t("spaces.data.page.typeMarkdown"),
        version: t("spaces.data.page.version"),
        you: t("spaces.data.page.you"),
      }}
      locale={i18n.resolvedLanguage ?? i18n.language}
      parentId={artifact.parent_id}
      spaceId={spaceId}
      type={artifact.type}
      updatedAt={artifact.updated_at}
      updatedBy={version.created_by ?? artifact.created_by}
      updatedByKind={version.created_by_kind ?? artifact.created_by_kind}
      version={artifact.current_version}
    />
  );

  return (
    <PaneChrome
      actions={actions}
      breadcrumbs={breadcrumbs}
      contentStackBackground={readingStyle === "tone" ? "paper" : "card"}
      menuItems={menuItems}
      onClose={onClose}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        {error ? (
          <p className="border-destructive/40 border-b bg-destructive/10 px-6 py-2 text-destructive text-xs">
            {error}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <MarkdownDocumentEditor
            editable={editing}
            key={`${artifact.current_version}:${editing ? "edit" : "view"}`}
            markdown={editing ? draft : content}
            onChange={setDraft}
            onTitleChange={editing ? setTitleDraft : undefined}
            properties={properties}
            readingStyle={readingStyle}
            title={editing ? titleDraft : artifact.title}
            titlePlaceholder={t("spaces.data.page.untitled", {
              defaultValue: "Untitled",
            })}
          />
        </div>
      </div>
      {dialogs}
    </PaneChrome>
  );
}

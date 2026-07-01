/**
 * KB Article Edit Page — Notion-like zen editor.
 *
 * Features:
 * - Inline title (large, no form field chrome)
 * - Slash commands (type "/" to insert blocks)
 * - Collapsible properties bar (status, parent, tags)
 * - Document upload for new articles
 * - Clean, centered layout
 */

import { RichEditorContent } from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import "../../kb-print.css";
import {
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@engenty/ui-core";
import { AnimatedDownloadIcon } from "@engenty/ui-icons";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import type { SourceReference } from "../../../src/schema/types.js";
import { articleDetailQueryOptions } from "../../queries.js";
import { ArticleHeaderChrome } from "../article-header-chrome.js";
import { ArticleHeaderTopline } from "../article-header-topline.js";
import { ArticlePropertiesPanel } from "../article-properties-panel/index.js";
import { ArticleSiblingNav } from "../article-sibling-nav.js";
import { ArticleSourceReferencesBlock } from "../article-source-references.js";
import { ArticleSourceTopline } from "../article-source-topline.js";
import { ArticleSummaryInlineEditor } from "../article-summary-inline-editor.js";
import { ArticleTemplateTopline } from "../article-template-topline.js";
import { DocumentUpload } from "../document-upload.js";
import { InsertConvertedMarkdownDialog } from "../insert-converted-markdown-dialog.js";
import { KbEntityVersionsDialog } from "../kb-entity-versions-dialog.js";
import { KbTagPicker } from "../kb-tag-picker.js";

export interface ArticleEditViewProps {
  state: any;
}

export function ArticleEditView({ state }: ArticleEditViewProps) {
  const {
    article,
    applyTemplateSelection,
    canRegenerateMetadata,
    candidateParents,
    contentMarkdown,
    conversionSessionRef,
    createDefaultKbMutation,
    defaultCategoryId,
    dialogOpenedForSessionRef,
    downloadOriginal,
    downloadingOriginal,
    draftArticle,
    editor,
    editorContentProps,
    effectiveTemplate,
    handleInsertPendingMarkdown,
    handlePropertyPatch,
    id,
    insertDialogOpen,
    insertMarkdownPreference,
    isLoading,
    isLocked,
    isNew,
    kbArticlePageShellInnerBaseClassName,
    kbArticlePageShellSectionClassName,
    kbCategories,
    kbIdForForm,
    kbSlugEffective,
    kbTags,
    kbTemplates,
    noKbs,
    originalDocumentName,
    originalDocumentUrl,
    parentArticleId,
    parentChainForHeader,
    pendingInsertMarkdown,
    propertyDefinitions,
    queryClient,
    regenerateMetadataMut,
    saveMutation,
    selectedTagIds,
    setCategoryId,
    setContentJson,
    setContentMarkdown,
    setInsertDialogOpen,
    setInsertMarkdownPreference,
    setInsertMarkdownPreferenceState,
    setOriginalDocumentName,
    setOriginalDocumentUrl,
    setParentArticleId,
    setPendingInsertMarkdown,
    setSelectedTagIds,
    setSlug,
    setStatus,
    setSummary,
    setTitle,
    setUploadNoExtractableText,
    setVersionsDialogOpen,
    slugify,
    sourceProvenance,
    status,
    summary,
    t,
    templateId,
    templateMode,
    title,
    titleRef,
    uploadNoExtractableText,
    versionsDialogOpen,
  } = state;
  if (!isNew && isLoading) {
    return (
      <section className={cn(kbArticlePageShellSectionClassName, "gap-6")}>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </section>
    );
  }

  const newArticleMetadata = (
    <div className="kb-properties">
      <div className="kb-properties-fields">
        <div className="kb-property">
          <span className="kb-property-label">
            {t("article.fields.status")}
          </span>
          <Select onValueChange={setStatus} value={status}>
            <SelectTrigger className="kb-property-field w-full min-w-0">
              <SelectValue>
                {status === "draft"
                  ? t("article.status.draft")
                  : status === "published"
                    ? t("article.status.published")
                    : t("article.status.archived")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("article.status.draft")}</SelectItem>
              <SelectItem value="published">
                {t("article.status.published")}
              </SelectItem>
              <SelectItem value="archived">
                {t("article.status.archived")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="kb-property">
          <span className="kb-property-label">
            {t("article.fields.parent_article")}
          </span>
          <Select
            onValueChange={(v) => setParentArticleId(v === "__none__" ? "" : v)}
            value={parentArticleId || "__none__"}
          >
            <SelectTrigger className="kb-property-field w-full min-w-0">
              <SelectValue>
                {parentArticleId
                  ? (candidateParents.find((a) => a.id === parentArticleId)
                      ?.title ?? "…")
                  : "—"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {candidateParents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="kb-property kb-property-wide">
          <span className="kb-property-label">{t("article.fields.tags")}</span>
          <KbTagPicker
            kbId={kbIdForForm}
            onSelectedTagIdsChange={setSelectedTagIds}
            selectedTagIds={selectedTagIds}
          />
        </div>
      </div>
    </div>
  );

  const editorColumn = (
    <>
      <input
        aria-hidden
        className="sr-only"
        readOnly
        ref={titleRef}
        tabIndex={-1}
        value={title}
      />

      <ArticleHeaderChrome
        article={article}
        kbSlug={kbSlugEffective}
        parentChainOverride={
          parentChainForHeader.length > 0 ? parentChainForHeader : undefined
        }
        templateTopline={
          sourceProvenance || kbIdForForm ? (
            <ArticleHeaderTopline>
              {sourceProvenance && kbSlugEffective ? (
                <ArticleSourceTopline
                  kbSlug={kbSlugEffective}
                  provenance={sourceProvenance}
                />
              ) : null}
              {kbIdForForm ? (
                <ArticleTemplateTopline
                  effectiveTemplate={effectiveTemplate}
                  onRegenerateMetadata={() => regenerateMetadataMut.mutate()}
                  onSelect={applyTemplateSelection}
                  regenerateMetadataDisabled={isLocked}
                  regenerateMetadataPending={regenerateMetadataMut.isPending}
                  showRegenerateMetadata={canRegenerateMetadata}
                  templateId={templateId}
                  templateMode={templateMode}
                  templates={kbTemplates}
                />
              ) : null}
            </ArticleHeaderTopline>
          ) : null
        }
        titleEdit={{
          onChange: (v) => {
            setTitle(v);
            if (isNew) {
              setSlug(slugify(v));
            }
          },
          placeholder: t("article.untitled"),
          value: title,
        }}
      />

      {draftArticle ? (
        <ArticlePropertiesPanel
          article={draftArticle}
          collapseUnpinnedMetadata
          kbSlug={kbSlugEffective}
          onCommitTagIds={(ids) => setSelectedTagIds(ids)}
          onPatchArticle={handlePropertyPatch}
          propertyDefinitions={propertyDefinitions}
        />
      ) : (
        newArticleMetadata
      )}

      {noKbs ? (
        <div className="flex items-center gap-3 rounded-md border border-amber-300/40 bg-amber-100/10 p-3 text-sm">
          <span className="flex-1 text-amber-900 dark:text-amber-200">
            {t(
              "article.no_kb_warning",
              "No knowledge base exists yet. Create one to start adding articles."
            )}
          </span>
          <Button
            disabled={createDefaultKbMutation.isPending}
            onClick={() => createDefaultKbMutation.mutate()}
            size="sm"
            variant="outline"
          >
            {createDefaultKbMutation.isPending
              ? "Creating…"
              : t("article.create_default_kb", "Create default knowledge base")}
          </Button>
        </div>
      ) : null}

      <div className="space-y-6">
        {article && kbSlugEffective && !isNew ? (
          <ArticleSourceReferencesBlock
            kbSlug={kbSlugEffective}
            refs={
              (article as { source_references?: SourceReference[] })
                .source_references ?? []
            }
            variant="plain"
          />
        ) : null}

        {article &&
        !isNew &&
        article.questions_answered &&
        article.questions_answered.length > 0 ? (
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="font-medium text-muted-foreground text-sm">
              {t("article.fields.questions")}
            </p>
            <ul className="mt-2 space-y-1">
              {article.questions_answered.map((q, i) => (
                <li className="text-sm" key={i}>
                  • {q}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ArticleSummaryInlineEditor
          contentMarkdown={contentMarkdown}
          onChange={setSummary}
          summary={summary}
          title={title}
        />

        <div className="tiptap-rich-editor flex min-h-[18rem] flex-col">
          {editor ? (
            <RichEditorContent
              className="flex min-h-0 flex-1 flex-col"
              editor={editor}
              editorContentClassName="min-h-[12rem] flex-1"
              {...editorContentProps}
            />
          ) : (
            <Skeleton className="min-h-[12rem] w-full flex-1" />
          )}
        </div>
      </div>

      {article && kbSlugEffective && !isNew ? (
        <ArticleSiblingNav article={article} kbSlug={kbSlugEffective} />
      ) : null}

      {article &&
      !isNew &&
      ((article.attachments && article.attachments.length > 0) ||
        article.original_document_name) ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">
            {t("article.fields.files", "Files")}
          </h3>
          <div className="flex flex-col gap-2">
            {article.original_document_name ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="break-all font-medium leading-tight">
                    {article.original_document_name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t("article.fields.original_document")}
                  </p>
                </div>
                {article.original_document_url ? (
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Button
                      disabled={downloadingOriginal}
                      onClick={() => void downloadOriginal()}
                      size="sm"
                      variant="outline"
                    >
                      <AnimatedDownloadIcon
                        className="mr-1.5"
                        play={downloadingOriginal ? "always" : "hover"}
                        size="sm"
                      />
                      {t("article.actions.download_original", "Download")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {article.attachments?.map((att) => (
              <div
                className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                key={att.id}
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                {att.filename}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );

  const hasUploadFooter =
    Boolean(originalDocumentName) ||
    uploadNoExtractableText ||
    (Boolean(pendingInsertMarkdown?.trim()) && !insertDialogOpen);

  const uploadBelowControls = hasUploadFooter ? (
    <>
      {originalDocumentName ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/10 px-3 py-2 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="break-all font-medium leading-tight">
              {originalDocumentName}
            </p>
            <p className="text-muted-foreground text-xs">
              {isNew
                ? t(
                    "article.upload.attached_pending_short",
                    "Original is stored in the vault when you save."
                  )
                : t("article.fields.original_document", "Original upload")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {pendingInsertMarkdown?.trim() ? (
              <Button
                className="h-8"
                onClick={() => void handleInsertPendingMarkdown()}
                size="sm"
                type="button"
                variant="secondary"
              >
                {t(
                  "article.upload.insert_dialog.insert_button",
                  "Insert as content"
                )}
              </Button>
            ) : null}
            {originalDocumentUrl ? (
              <Button
                disabled={downloadingOriginal}
                onClick={() => void downloadOriginal()}
                size="sm"
                type="button"
                variant="outline"
              >
                <AnimatedDownloadIcon
                  className="mr-1.5"
                  play={downloadingOriginal ? "always" : "hover"}
                  size="sm"
                />
                {t("article.actions.download_original", "Download")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {uploadNoExtractableText ? (
        <div className="rounded-md border border-amber-300/40 bg-amber-100/10 px-3 py-2 text-amber-950 text-xs dark:text-amber-100">
          {t(
            "article.upload.no_extract_hint",
            "No text could be extracted into the editor (conversion returned empty). You can still save the original file with the article."
          )}
          <button
            className="ml-2 underline"
            onClick={() => setUploadNoExtractableText(false)}
            type="button"
          >
            {t("article.upload.no_extract_dismiss", "Dismiss")}
          </button>
        </div>
      ) : null}
      {pendingInsertMarkdown?.trim() && !insertDialogOpen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/15 px-3 py-2 text-muted-foreground text-xs">
          <span className="min-w-0 flex-1">
            {t(
              "article.upload.pending_insert_banner",
              "Converted markdown is ready to add at the end of the article."
            )}
          </span>
          <Button
            onClick={() => {
              setPendingInsertMarkdown(null);
              dialogOpenedForSessionRef.current = -1;
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("article.upload.pending_insert_dismiss", "Dismiss")}
          </Button>
        </div>
      ) : null}
    </>
  ) : undefined;

  return (
    <>
      <section className={kbArticlePageShellSectionClassName}>
        <div
          className={cn(
            kbArticlePageShellInnerBaseClassName,
            "kb-article-editor"
          )}
        >
          {isLocked ? (
            <div className="rounded-md border border-amber-300/40 bg-amber-100/10 px-3 py-2 text-amber-950 text-sm dark:text-amber-100">
              {t("article.locked_banner")}
            </div>
          ) : null}
          {kbIdForForm ? (
            <DocumentUpload
              belowControls={uploadBelowControls}
              disabled={saveMutation.isPending || !kbIdForForm || isLocked}
              kbId={kbIdForForm}
              onConverted={({ filename, markdown, originalStoragePath }) => {
                conversionSessionRef.current += 1;
                const hasMd = Boolean(markdown.trim());
                setUploadNoExtractableText(!hasMd);
                if (hasMd) {
                  setPendingInsertMarkdown(markdown);
                } else {
                  setPendingInsertMarkdown(null);
                  toast.message(
                    t(
                      "article.upload.no_extract_toast",
                      "No text was extracted from this file. The original can still be saved as an attachment."
                    )
                  );
                }
                if (originalStoragePath) {
                  setOriginalDocumentUrl(originalStoragePath);
                  setOriginalDocumentName(filename);
                }
                if (!title) {
                  const name = filename
                    .replace(/\.[^.]+$/, "")
                    .replace(/[_-]/g, " ");
                  setTitle(name);
                  setSlug(slugify(name));
                }
              }}
            >
              {editorColumn}
            </DocumentUpload>
          ) : (
            editorColumn
          )}

          <InsertConvertedMarkdownDialog
            onCancel={() => {
              setInsertDialogOpen(false);
            }}
            onInsert={() => void handleInsertPendingMarkdown()}
            onPreferenceChange={(v) => {
              setInsertMarkdownPreferenceState(v);
              setInsertMarkdownPreference(v);
            }}
            open={insertDialogOpen}
            preference={insertMarkdownPreference}
          />
        </div>
      </section>
      {!isNew && id && id !== "new" ? (
        <KbEntityVersionsDialog
          entityId={id}
          kind="article"
          onOpenChange={setVersionsDialogOpen}
          onRestored={() => {
            void queryClient.invalidateQueries({
              queryKey: articleDetailQueryOptions(id).queryKey,
            });
          }}
          open={versionsDialogOpen}
        />
      ) : null}
    </>
  );
}

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

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import type { InlineBubbleMenuOptions } from "@engenty/tiptap-editor";
import { markdownToJson, useRichEditor } from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import "../kb-print.css";
import type { JSONContent } from "@engenty/tiptap-editor";
import {
  Button,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Eye, History, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";
import { kbMergeArticlePropertyDefinitions } from "../../src/schema/knowledge-bases.js";
import type { Article, SourceReference, Tag } from "../../src/schema/types.js";
import {
  createArticle,
  createKb,
  getKbSettings,
  refreshArticleMetadata,
  updateArticle,
  updateKbSettings,
} from "../api.js";
import {
  appendMarkdownAtEnd,
  isEditorTextEmpty,
} from "../append-markdown-to-editor.js";
import { ArticlePageOverflowMenu } from "../components/article-page-overflow-menu.js";
import { getFileStorageSignedUrl } from "../file-storage-url.js";
import {
  getInsertMarkdownPreference,
  type InsertMarkdownPreference,
  setInsertMarkdownPreference,
} from "../insert-markdown-preference.js";
import {
  kbArticleEditPath,
  kbArticlePath,
  kbHubPath,
  kbNewArticleEditPath,
  kbNewArticleEditPathWithParent,
} from "../kb-paths.js";
import {
  kbArticlePageShellInnerBaseClassName,
  kbArticlePageShellSectionClassName,
} from "../lib/article-page-shell.js";
import { resolveArticleSourceProvenance } from "../lib/article-source-provenance.js";
import {
  buildCategoryTreeBreadcrumbCrumbs,
  resolveArticleCategory,
} from "../lib/category-display-paths.js";
import { createKbArticleLinkBubbleSources } from "../lib/kb-article-inline-link-sources.js";
import { truncateKbBreadcrumbSegment } from "../lib/kb-breadcrumb-truncate.js";
import { resolveKbEffectiveTemplateClient } from "../lib/kb-effective-template.js";
import { createKbModuleRichEditorLinkHandler } from "../lib/kb-rich-editor-link-navigation.js";
import {
  articleDetailQueryOptions,
  articlesQueryOptions,
  categoriesQueryOptions,
  invalidateKbGraphQueries,
  kbSettingsQueryOptions,
  kbsQueryOptions,
  kbTemplatesQueryOptions,
  tagsQueryOptions,
} from "../queries.js";
import {
  kbIdFromSlug,
  resolveKbIdFromUrl,
  slugFromKbId,
  tenantDefaultKbId,
} from "../resolve-kb-id.js";
import { useKbModuleSecondaryShellNav } from "./use-kb-module-secondary-shell-nav.js";

export function useArticleEditState() {
  const { i18n, t } = useTranslation("kb");
  const { kbSlug: kbSlugParam, id } = useParams<{
    kbSlug?: string;
    id?: string;
  }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id || id === "new";
  const titleRef = useRef<HTMLInputElement>(null);

  // Get KB ID
  const { data: kbs = [], isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const { data: kbSettings } = useQuery(kbSettingsQueryOptions);
  const tenantDefault = tenantDefaultKbId(kbSettings);
  const noKbs = isNew && !kbsLoading && kbs.length === 0;

  const createDefaultKbMutation = useMutation({
    mutationFn: async () => {
      const settings = await getKbSettings();
      const kb = await createKb({
        name: "Default",
        slug: "default",
        description: null,
      });
      await updateKbSettings({ ...settings, default_kb_id: kb.id });
      return kb;
    },
    onSuccess: (kb) => {
      queryClient.invalidateQueries({ queryKey: ["kb", "knowledge-bases"] });
      queryClient.invalidateQueries({ queryKey: ["kb", "settings"] });
      setSelectedKbId(kb.id);
      toast.success("Knowledge base created");
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to create knowledge base"
      );
    },
  });

  // Form state
  const [selectedKbId, setSelectedKbId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [parentArticleId, setParentArticleId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [contentJson, setContentJson] = useState<JSONContent | null>(null);
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [customProperties, setCustomProperties] = useState<
    Record<string, string | number | null>
  >({});
  const [templateMode, setTemplateMode] = useState<
    "inherit" | "none" | "template"
  >("inherit");
  const [templateId, setTemplateId] = useState<string>("");
  const [originalDocumentUrl, setOriginalDocumentUrl] = useState<string | null>(
    null
  );
  const [originalDocumentName, setOriginalDocumentName] = useState<
    string | null
  >(null);
  const [downloadingOriginal, setDownloadingOriginal] = useState(false);

  const [insertMarkdownPreference, setInsertMarkdownPreferenceState] =
    useState<InsertMarkdownPreference>(getInsertMarkdownPreference);
  const [pendingInsertMarkdown, setPendingInsertMarkdown] = useState<
    string | null
  >(null);
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);
  /** Server returned no markdown (conversion failed or unsupported) — show notice. */
  const [uploadNoExtractableText, setUploadNoExtractableText] = useState(false);
  const conversionSessionRef = useRef(0);
  const dialogOpenedForSessionRef = useRef(-1);

  // Load existing article
  const { data: article, isLoading } = useQuery({
    ...articleDetailQueryOptions(id ?? ""),
    enabled: !isNew && !!id,
  });

  const isLocked = !isNew && Boolean(article?.locked_at);

  /** URL / default KB for new articles — do not rely on Select state alone (sync races). */
  const resolvedNewKbId = useMemo(() => {
    if (kbSlugParam?.trim()) {
      return kbIdFromSlug(kbs, kbSlugParam);
    }
    return resolveKbIdFromUrl(searchParams, kbs, tenantDefault);
  }, [kbSlugParam, searchParams, kbs, tenantDefault]);

  const kbIdForForm = isNew
    ? selectedKbId || resolvedNewKbId
    : selectedKbId || article?.kb_id || "";

  const kbSlugEffective = useMemo(
    () => slugFromKbId(kbs, kbIdForForm) ?? "",
    [kbs, kbIdForForm]
  );

  useEffect(() => {
    if (kbsLoading || !kbs.length || !kbIdForForm) {
      return;
    }
    const slug = slugFromKbId(kbs, kbIdForForm);
    if (!slug) {
      return;
    }
    if (isNew) {
      if (!kbSlugParam && searchParams.get("kb_id")?.trim()) {
        const keep = new URLSearchParams();
        const parent = searchParams.get("parent")?.trim();
        if (parent) {
          keep.set("parent", parent);
        }
        const qs = keep.toString();
        navigate(`${kbNewArticleEditPath(slug)}${qs ? `?${qs}` : ""}`, {
          replace: true,
        });
      }
      return;
    }
    if (!id || id === "new") {
      return;
    }
    if (!article) {
      return;
    }
    if (kbSlugParam === slug && id === article.slug) {
      return;
    }
    navigate(
      `${kbArticleEditPath(slug, article.slug || id)}${location.search}`,
      {
        replace: true,
      }
    );
  }, [
    kbsLoading,
    kbs,
    kbIdForForm,
    kbSlugParam,
    id,
    isNew,
    article,
    navigate,
    location.search,
    searchParams,
  ]);

  // Load tags
  const { data: candidateParentsPage } = useQuery(
    articlesQueryOptions({
      kb_id: kbIdForForm,
      page_size: 200,
      sort_by: "title",
      sort_order: "asc",
    })
  );
  const candidateParents: Article[] = (candidateParentsPage?.data ?? []).filter(
    (a: Article) => a.id !== id
  );

  const { data: kbTags = [] } = useQuery({
    ...tagsQueryOptions(kbIdForForm),
    enabled: Boolean(kbIdForForm),
  });

  const { data: kbTemplates = [] } = useQuery({
    ...kbTemplatesQueryOptions(kbIdForForm),
    enabled: Boolean(kbIdForForm),
  });

  const { data: kbCategories = [] } = useQuery({
    ...categoriesQueryOptions(kbIdForForm),
    enabled: Boolean(kbIdForForm),
  });

  const defaultCategoryId = useMemo(
    () => kbCategories.find((c) => c.is_default)?.id ?? null,
    [kbCategories]
  );

  const effectiveTemplate = useMemo(
    () =>
      resolveKbEffectiveTemplateClient(kbCategories, kbTemplates, {
        category_id: categoryId || article?.category_id || "",
        template_id: templateMode === "template" ? templateId || null : null,
        template_mode: templateMode,
      }),
    [
      article?.category_id,
      categoryId,
      kbCategories,
      kbTemplates,
      templateId,
      templateMode,
    ]
  );

  const canRegenerateMetadata =
    Boolean(effectiveTemplate) && !isNew && Boolean(id);

  const sourceProvenance = useMemo(() => {
    if (!article || isNew) {
      return null;
    }
    const refs =
      (article as { source_references?: SourceReference[] })
        .source_references ?? [];
    return resolveArticleSourceProvenance(article, refs);
  }, [article, isNew]);

  const regenerateMetadataMut = useMutation({
    mutationFn: () => refreshArticleMetadata(id ?? ""),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: articleDetailQueryOptions(updated.id).queryKey,
      });
      void queryClient.invalidateQueries({ queryKey: ["kb", "articles"] });
      toast.success(t("templates.regenerate_metadata_success"));
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("templates.regenerate_metadata_failed")
      );
    },
  });

  const propertyDefinitions = useMemo(() => {
    const kb = kbs.find((k) => k.id === kbIdForForm);
    return kbMergeArticlePropertyDefinitions(kb?.article_property_definitions);
  }, [kbs, kbIdForForm]);

  const parentChainForHeader = useMemo(() => {
    if (article?.parent_chain && article.parent_chain.length > 0) {
      return article.parent_chain;
    }
    const pid = parentArticleId.trim();
    if (!pid) {
      return [];
    }
    const p = candidateParents.find((a) => a.id === pid);
    return p ? [{ id: p.id, title: p.title }] : [{ id: pid, title: "…" }];
  }, [article?.parent_chain, parentArticleId, candidateParents]);

  const draftArticle = useMemo((): Article | null => {
    if (isNew || !article || !kbIdForForm) {
      return null;
    }
    const tags: Tag[] = selectedTagIds.map((tid) => {
      const fromKb = kbTags.find((tg: Tag) => tg.id === tid);
      if (fromKb) {
        return fromKb;
      }
      const fromArticle = article.tags?.find((tg: Tag) => tg.id === tid);
      if (fromArticle) {
        return fromArticle;
      }
      return {
        id: tid,
        name: tid,
        slug: tid,
        kb_id: kbIdForForm,
        color: null,
        created_at: "",
        tenant_id: article.tenant_id,
        scope_id: article.scope_id,
      };
    });
    return {
      ...article,
      title,
      slug,
      status: status as Article["status"],
      parent_article_id: parentArticleId || null,
      category_id: categoryId || article.category_id,
      summary: summary || null,
      tags,
      content_json: (contentJson ?? null) as unknown as Article["content_json"],
      content_markdown: contentMarkdown || null,
      custom_properties: customProperties,
      template_id: templateMode === "template" ? templateId || null : null,
      template_mode: templateMode,
      effective_template: effectiveTemplate,
    };
  }, [
    article,
    isNew,
    kbIdForForm,
    selectedTagIds,
    kbTags,
    title,
    slug,
    status,
    parentArticleId,
    categoryId,
    summary,
    contentJson,
    contentMarkdown,
    customProperties,
    templateId,
    templateMode,
    effectiveTemplate,
  ]);

  const handlePropertyPatch = useCallback((patch: Record<string, unknown>) => {
    if (typeof patch.status === "string") {
      setStatus(patch.status);
    }
    if ("parent_article_id" in patch) {
      const v = patch.parent_article_id;
      setParentArticleId(
        v === null || v === undefined || v === "" ? "" : String(v)
      );
    }
    if ("category_id" in patch) {
      const v = patch.category_id;
      setCategoryId(v === null || v === undefined || v === "" ? "" : String(v));
    }
    if (
      patch.custom_properties &&
      typeof patch.custom_properties === "object" &&
      !Array.isArray(patch.custom_properties)
    ) {
      setCustomProperties((prev) => ({
        ...prev,
        ...(patch.custom_properties as Record<string, string | number | null>),
      }));
    }
  }, []);

  /** Last `parent` search param applied to form (avoids clobbering a cleared parent while URL still has `?parent=`). */
  const lastParentSearchParam = useRef<string | null>(null);

  // New article: optional `?parent=<articleId>` from sidebar "add sub-page"
  useEffect(() => {
    if (!isNew) {
      lastParentSearchParam.current = null;
      return;
    }
    const raw = searchParams.get("parent")?.trim() ?? "";
    if (raw === lastParentSearchParam.current) {
      return;
    }
    lastParentSearchParam.current = raw || null;
    if (raw) {
      setParentArticleId(raw);
    }
  }, [isNew, searchParams]);

  // New article: optional `?category=<categoryId>` from sidebar tree "+ Add Page".
  // Backend resolves to KB's `general` row when omitted.
  useEffect(() => {
    if (!isNew) {
      return;
    }
    const raw = searchParams.get("category")?.trim() ?? "";
    if (raw) {
      setCategoryId(raw);
    }
  }, [isNew, searchParams]);

  // Populate form on load
  useEffect(() => {
    if (article && !isNew) {
      setTitle(article.title);
      setSlug(article.slug);
      setStatus(article.status);
      setParentArticleId(article.parent_article_id ?? "");
      setCategoryId(article.category_id ?? "");
      setSummary(article.summary ?? "");
      setContentJson(article.content_json as JSONContent | null);
      setContentMarkdown(article.content_markdown ?? "");
      setSelectedTagIds(article.tags?.map((tag: Tag) => tag.id) ?? []);
      setSelectedKbId(article.kb_id);
      setOriginalDocumentUrl(article.original_document_url ?? null);
      setOriginalDocumentName(article.original_document_name ?? null);
      setCustomProperties(article.custom_properties ?? {});
      setTemplateMode(article.template_mode ?? "inherit");
      setTemplateId(article.template_id ?? "");
    }
  }, [article, isNew]);

  // Auto-focus title on new articles
  useEffect(() => {
    if (isNew && titleRef.current) {
      titleRef.current.focus();
    }
  }, [isNew]);

  const onKbPickerChange = useCallback(
    (next: string) => {
      setSelectedKbId(next);
      const slug = slugFromKbId(kbs, next);
      if (!slug) {
        return;
      }
      if (isNew) {
        const parent = parentArticleId.trim();
        navigate(
          parent
            ? kbNewArticleEditPathWithParent(slug, parent)
            : kbNewArticleEditPath(slug)
        );
      } else if (id && id !== "new") {
        navigate(kbArticleEditPath(slug, article?.slug || id));
      }
    },
    [id, isNew, kbs, navigate, parentArticleId, article]
  );

  const kbShellNav = useKbModuleSecondaryShellNav({
    activeArticleId: isNew ? undefined : id,
    kbId: kbIdForForm,
    kbSlug: kbSlugEffective,
  });

  const handleCancelEdit = useCallback(() => {
    if (!kbSlugEffective) {
      navigate(-1);
      return;
    }
    if (isNew) {
      navigate(kbHubPath(kbSlugEffective));
    } else if (id && id !== "new") {
      navigate(kbArticlePath(kbSlugEffective, article?.slug || id));
    } else {
      navigate(-1);
    }
  }, [isNew, id, kbSlugEffective, navigate, article]);

  const slugify = useCallback(
    (text: string) =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
    []
  );

  const downloadOriginal = useCallback(async () => {
    const key = originalDocumentUrl;
    if (!key) {
      return;
    }
    setDownloadingOriginal(true);
    try {
      const url = await getFileStorageSignedUrl(key);
      const a = document.createElement("a");
      a.href = url;
      a.download = originalDocumentName ?? "document";
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("article.original_download_error")
      );
    } finally {
      setDownloadingOriginal(false);
    }
  }, [originalDocumentUrl, originalDocumentName, t]);

  const blockMenuLabels = useMemo(
    () => ({
      searchPlaceholder: t("article.block_menu.search"),
      transformInto: t("article.block_menu.turn_into"),
      paragraph: t("article.block_menu.text"),
      heading1: t("article.block_menu.heading1"),
      heading2: t("article.block_menu.heading2"),
      heading3: t("article.block_menu.heading3"),
      bulletList: t("article.block_menu.bullet_list"),
      orderedList: t("article.block_menu.ordered_list"),
      blockquote: t("article.block_menu.quote"),
      duplicate: t("article.block_menu.duplicate"),
      deleteBlock: t("article.block_menu.delete"),
      addBlock: t("article.block_menu.add_block"),
      dragHandle: t("article.block_menu.drag_handle"),
    }),
    [t]
  );

  // `t` omitted from deps: its identity can change every render and would recreate this
  // object, destabilising TipTap bubble children. `i18n.language` covers locale switches.
  const inlineBubbleMenu = useMemo((): InlineBubbleMenuOptions => {
    const labels: InlineBubbleMenuOptions["labels"] = {
      link: t("article.bubble.link"),
      unlink: t("article.bubble.unlink"),
      applyUrl: t("article.bubble.apply_url"),
      urlPlaceholder: t("article.bubble.url_placeholder"),
      searchPlaceholder: t("article.bubble.search_placeholder"),
      noResults: t("article.bubble.no_results"),
      bold: t("article.bubble.bold"),
      italic: t("article.bubble.italic"),
      underline: t("article.bubble.underline"),
      strike: t("article.bubble.strike"),
      code: t("article.bubble.code"),
    };
    if (!(kbIdForForm && kbSlugEffective)) {
      return { labels, linkSources: [] };
    }
    return {
      labels,
      linkSources: createKbArticleLinkBubbleSources({
        kbs,
        currentKbId: kbIdForForm,
        currentKbSlug: kbSlugEffective,
        labels: {
          thisKb: t("article.bubble.link_source_this_kb"),
          otherKbs: t("article.bubble.link_source_other_kbs"),
        },
      }),
    };
  }, [kbIdForForm, kbSlugEffective, kbs, i18n.language]);

  const onRichEditorLinkClick = useMemo(
    () => createKbModuleRichEditorLinkHandler(navigate),
    [navigate]
  );

  const { editor, editorContentProps } = useRichEditor({
    // TipTap maps autoFocus to `autofocus: "end"`, which scrolls the page to the
    // bottom on load — confusing when opening article edit from the shell.
    autoFocus: false,
    blockMenuLabels,
    content: contentJson,
    editable: true,
    inlineBubbleMenu,
    onLinkClick: onRichEditorLinkClick,
    onChange: (json, markdown) => {
      setContentJson(json);
      setContentMarkdown(markdown);
    },
    placeholder: t(
      "article.content_placeholder",
      "Press Space for AI assistance, or type '/' for commands"
    ),
  });

  const applyTemplateSelection = useCallback(
    (value: string) => {
      if (value === "__inherit__") {
        setTemplateMode("inherit");
        setTemplateId("");
        return;
      }
      if (value === "__none__") {
        setTemplateMode("none");
        setTemplateId("");
        return;
      }
      setTemplateMode("template");
      setTemplateId(value);
      const template = kbTemplates.find((item) => item.id === value);
      const md = template?.content_markdown?.trim();
      if (!(editor && md && isEditorTextEmpty(editor))) {
        return;
      }
      const json = markdownToJson(md);
      editor.commands.setContent(json, { emitUpdate: true });
      setContentJson(json);
      setContentMarkdown(md);
    },
    [editor, kbTemplates]
  );

  const hydratedArticleIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editor || isNew || !article?.id) {
      return;
    }
    if (hydratedArticleIdRef.current === article.id) {
      return;
    }
    hydratedArticleIdRef.current = article.id;
    const rawJson = article.content_json as JSONContent | null;
    if (rawJson) {
      editor.commands.setContent(rawJson, { emitUpdate: false });
      setContentJson(rawJson);
      return;
    }
    const md = article.content_markdown?.trim();
    if (md) {
      const fromMd = markdownToJson(md);
      editor.commands.setContent(fromMd, { emitUpdate: false });
      setContentJson(fromMd);
      return;
    }
    const empty: JSONContent = { type: "doc", content: [] };
    editor.commands.setContent(empty, { emitUpdate: false });
    setContentJson(empty);
  }, [article, editor, isNew]);

  useEffect(() => {
    if (isNew) {
      hydratedArticleIdRef.current = null;
    }
  }, [isNew]);

  useEffect(() => {
    if (!(pendingInsertMarkdown?.trim() && editor)) {
      return;
    }
    const md = pendingInsertMarkdown.trim();
    const pref = insertMarkdownPreference;

    if (pref === "always") {
      const ok = appendMarkdownAtEnd(editor, md);
      if (ok) {
        setPendingInsertMarkdown(null);
        dialogOpenedForSessionRef.current = -1;
      } else {
        toast.error(
          t(
            "article.upload.insert_failed",
            "Could not insert markdown into the editor."
          )
        );
      }
      return;
    }
    if (pref === "always_if_empty" && isEditorTextEmpty(editor)) {
      const ok = appendMarkdownAtEnd(editor, md);
      if (ok) {
        setPendingInsertMarkdown(null);
        dialogOpenedForSessionRef.current = -1;
      } else {
        toast.error(
          t(
            "article.upload.insert_failed",
            "Could not insert markdown into the editor."
          )
        );
      }
      return;
    }
    if (
      (pref === "always_if_empty" && !isEditorTextEmpty(editor)) ||
      pref === "ask"
    ) {
      const s = conversionSessionRef.current;
      if (dialogOpenedForSessionRef.current !== s) {
        setInsertDialogOpen(true);
        dialogOpenedForSessionRef.current = s;
      }
    }
  }, [pendingInsertMarkdown, editor, insertMarkdownPreference]);

  const handleInsertPendingMarkdown = useCallback(() => {
    if (!(editor && pendingInsertMarkdown?.trim())) {
      return;
    }
    const ok = appendMarkdownAtEnd(editor, pendingInsertMarkdown);
    if (ok) {
      setPendingInsertMarkdown(null);
      setInsertDialogOpen(false);
      dialogOpenedForSessionRef.current = -1;
    } else {
      toast.error(
        t(
          "article.upload.insert_failed",
          "Could not insert markdown into the editor."
        )
      );
    }
  }, [editor, pendingInsertMarkdown, t]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isLocked) {
        throw new Error(t("article.locked_save_blocked"));
      }
      const payload = {
        kb_id: kbIdForForm,
        title,
        slug: slug || slugify(title),
        status,
        parent_article_id: parentArticleId || null,
        // null tells the API to resolve the KB's mandatory `general` category.
        category_id: categoryId || null,
        summary: summary || null,
        content_json: contentJson,
        content_markdown: contentMarkdown,
        tag_ids: selectedTagIds,
        custom_properties: customProperties,
        template_id: templateMode === "template" ? templateId || null : null,
        template_mode: templateMode,
        original_document_url: originalDocumentUrl,
        original_document_name: originalDocumentName,
      };
      if (isNew) {
        return createArticle(payload);
      }
      return updateArticle(id!, payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["kb", "articles"] });
      void queryClient.invalidateQueries({
        queryKey: ["kb", "articles", "versions", data.id],
      });
      void invalidateKbGraphQueries(queryClient, data.kb_id);
      toast.success(isNew ? "Article created" : "Article saved");
      const slug = slugFromKbId(kbs, data.kb_id);
      if (slug) {
        navigate(kbArticlePath(slug, data.slug || data.id));
      } else {
        navigate(`/mdl/knowledge-base/${data.id}`);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Save failed");
    },
  });

  const saveDisabledReason = isLocked
    ? t("article.locked_save_blocked")
    : kbIdForForm
      ? title.trim()
        ? undefined
        : t("article.hint.title", "Add a title")
      : t("article.hint.no_kb", "Create a knowledge base first");

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {!isNew && id && id !== "new" ? (
          <Button
            className={topbarIconButtonClassName}
            onClick={handleCancelEdit}
            size="sm"
            variant="outline"
          >
            <Eye aria-hidden className="h-4 w-4" />
            <TopbarActionLabel>{t("article.actions.view")}</TopbarActionLabel>
          </Button>
        ) : (
          <Button
            className={topbarIconButtonClassName}
            onClick={handleCancelEdit}
            size="sm"
            variant="outline"
          >
            <X aria-hidden className="h-4 w-4" />
            <TopbarActionLabel>{t("article.actions.cancel")}</TopbarActionLabel>
          </Button>
        )}
        {!isNew && id && id !== "new" ? (
          <Button
            className={topbarIconButtonClassName}
            onClick={() => setVersionsDialogOpen(true)}
            size="sm"
            variant="outline"
          >
            <History aria-hidden className="h-4 w-4" />
            <TopbarActionLabel>{t("versions.action")}</TopbarActionLabel>
          </Button>
        ) : null}
        {!isNew && article && kbSlugEffective ? (
          <ArticlePageOverflowMenu
            article={article}
            hideReadingStyle
            kbSlug={kbSlugEffective}
            navigate={navigate}
            showRegenerateMetadata={canRegenerateMetadata}
            topbarTriggerVariant="outline"
          />
        ) : null}
        <Button
          className={topbarIconButtonClassName}
          disabled={
            saveMutation.isPending || !title.trim() || !kbIdForForm || isLocked
          }
          onClick={() => saveMutation.mutate()}
          size="sm"
          title={saveDisabledReason}
        >
          <Save aria-hidden className="h-4 w-4" />
          <TopbarActionLabel>
            {saveMutation.isPending
              ? t("article.saving")
              : t("article.actions.save")}
          </TopbarActionLabel>
        </Button>
      </div>
    ),
    [
      article,
      canRegenerateMetadata,
      handleCancelEdit,
      id,
      isLocked,
      isNew,
      kbIdForForm,
      kbSlugEffective,
      navigate,
      saveMutation,
      saveDisabledReason,
      t,
      title,
    ]
  );

  const articleEditBreadcrumbs = useMemo(() => {
    const root = kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : [];
    if (isNew) {
      return [...root, { label: t("article.new") }];
    }
    const displayTitle = title.trim() || article?.title?.trim() || "…";
    const titleSeg = truncateKbBreadcrumbSegment(displayTitle);
    const articleCategory = resolveArticleCategory(
      categoryId || article?.category_id,
      kbCategories,
      defaultCategoryId
    );
    const categoryCrumbs =
      articleCategory && kbSlugEffective
        ? buildCategoryTreeBreadcrumbCrumbs(
            articleCategory,
            kbCategories,
            kbSlugEffective,
            { linkCurrent: true }
          )
        : [];
    return [
      ...root,
      ...categoryCrumbs,
      {
        label: titleSeg.label,
        menuLabel: displayTitle,
        ...(titleSeg.tooltip ? { tooltip: titleSeg.tooltip } : {}),
        ...(kbSlugEffective && id && id !== "new"
          ? { to: kbArticlePath(kbSlugEffective, article?.slug || id) }
          : {}),
      },
      { label: t("article.edit") },
    ];
  }, [
    article?.category_id,
    article?.title,
    categoryId,
    defaultCategoryId,
    id,
    isNew,
    kbCategories,
    kbShellNav.kbRootCrumb,
    kbSlugEffective,
    t,
    title,
  ]);

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs: articleEditBreadcrumbs,
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  return {
    article,
    applyTemplateSelection,
    canRegenerateMetadata,
    candidateParents,
    contentMarkdown,
    createDefaultKbMutation,
    conversionSessionRef,
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
  };
}

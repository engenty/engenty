/**
 * KB FAQ Edit — Notion-style title + TipTap block editor (same stack as articles).
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  markdownToJson,
  RichEditorContent,
  useRichEditor,
} from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import type { JSONContent } from "@engenty/tiptap-editor";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { History, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";
import { createFaq, updateFaq } from "../api.js";
import { KbEntityVersionsDialog } from "../components/kb-entity-versions-dialog.js";
import { KbTagPicker } from "../components/kb-tag-picker.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import {
  KB_MODULE_BASE,
  kbFaqEditPath,
  kbFaqPath,
  kbFaqsListPath,
  kbNewFaqEditPath,
} from "../kb-paths.js";
import {
  kbModulePageShellInnerNarrowClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import {
  faqDetailQueryOptions,
  kbSettingsQueryOptions,
  kbsQueryOptions,
} from "../queries.js";
import {
  kbIdFromSlug,
  resolveKbIdFromUrl,
  slugFromKbId,
  tenantDefaultKbId,
} from "../resolve-kb-id.js";

export function FaqEditPage() {
  const { t } = useTranslation("kb");
  const { kbSlug: kbSlugParam, id } = useParams<{
    kbSlug?: string;
    id?: string;
  }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !id || id === "new";
  const questionRef = useRef<HTMLInputElement>(null);
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);

  const { data: kbs = [] } = useQuery(kbsQueryOptions);
  const { data: kbSettings } = useQuery(kbSettingsQueryOptions);
  const tenantDefault = tenantDefaultKbId(kbSettings);

  const [selectedKbId, setSelectedKbId] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [answerJson, setAnswerJson] = useState<JSONContent | null>(null);
  const [answerMarkdown, setAnswerMarkdown] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const { data: faq, isLoading } = useQuery({
    ...faqDetailQueryOptions(id ?? ""),
    enabled: !isNew && !!id && id !== "new",
  });

  const resolvedNewKbId = useMemo(() => {
    if (kbSlugParam?.trim()) {
      return kbIdFromSlug(kbs, kbSlugParam);
    }
    return resolveKbIdFromUrl(searchParams, kbs, tenantDefault);
  }, [kbSlugParam, searchParams, kbs, tenantDefault]);

  const kbSlugEffective = useMemo(
    () => slugFromKbId(kbs, selectedKbId) ?? "",
    [kbs, selectedKbId]
  );

  useEffect(() => {
    if (!(kbs.length && selectedKbId)) {
      return;
    }
    const slug = slugFromKbId(kbs, selectedKbId);
    if (!slug) {
      return;
    }
    if (isNew) {
      if (!kbSlugParam && searchParams.get("kb_id")?.trim()) {
        navigate(`${kbNewFaqEditPath(slug)}`, { replace: true });
      }
      return;
    }
    if (!id || id === "new") {
      return;
    }
    if (kbSlugParam === slug) {
      return;
    }
    navigate(`${kbFaqEditPath(slug, id)}${location.search}`, { replace: true });
  }, [
    kbs,
    selectedKbId,
    kbSlugParam,
    id,
    isNew,
    navigate,
    location.search,
    searchParams,
  ]);

  useEffect(() => {
    if (faq && !isNew) {
      setQuestion(faq.question);
      setStatus(faq.status);
      setSelectedTagIds(faq.tags?.map((tag) => tag.id) ?? []);
      setSelectedKbId(faq.kb_id);
      setAnswerMarkdown(faq.answer_markdown ?? "");
    } else if (isNew && !selectedKbId && resolvedNewKbId) {
      setSelectedKbId(resolvedNewKbId);
    }
  }, [faq, isNew, selectedKbId, resolvedNewKbId]);

  useEffect(() => {
    if (isNew && questionRef.current) {
      questionRef.current.focus();
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
        navigate(kbNewFaqEditPath(slug));
      } else if (id && id !== "new") {
        navigate(kbFaqEditPath(slug, id));
      }
    },
    [id, isNew, kbs, navigate]
  );

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId: selectedKbId,
    kbSlug: kbSlugEffective,
  });

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

  const { editor, editorContentProps } = useRichEditor({
    autoFocus: !isNew,
    blockMenuLabels,
    content: answerJson ?? undefined,
    editable: true,
    onChange: (json, markdown) => {
      setAnswerJson(json);
      setAnswerMarkdown(markdown);
    },
    placeholder: t("article.content_placeholder"),
  });

  const hydratedFaqIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editor || isNew || !faq?.id) {
      return;
    }
    if (hydratedFaqIdRef.current === faq.id) {
      return;
    }
    hydratedFaqIdRef.current = faq.id;

    const stored = faq.answer_json as JSONContent | null;
    if (stored && typeof stored === "object") {
      editor.commands.setContent(stored, { emitUpdate: false });
      setAnswerJson(stored);
      return;
    }
    if (faq.answer_markdown?.trim()) {
      try {
        const fromMd = markdownToJson(faq.answer_markdown);
        editor.commands.setContent(fromMd, { emitUpdate: false });
        setAnswerJson(fromMd);
        setAnswerMarkdown(faq.answer_markdown);
        return;
      } catch {
        /* fall through */
      }
    }
    const empty: JSONContent = { type: "doc", content: [] };
    editor.commands.setContent(empty, { emitUpdate: false });
    setAnswerJson(empty);
  }, [editor, faq, isNew]);

  useEffect(() => {
    if (isNew) {
      hydratedFaqIdRef.current = null;
    }
  }, [isNew]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        kb_id: selectedKbId,
        question,
        answer_json: answerJson,
        answer_markdown: answerMarkdown || null,
        status,
        tag_ids: selectedTagIds,
        sort_order: faq?.sort_order ?? 0,
      };
      if (isNew) {
        return createFaq(payload);
      }
      return updateFaq(id!, payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["kb", "faqs"] });
      queryClient.invalidateQueries({
        queryKey: ["kb", "faqs", "detail", data.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["kb", "faqs", "versions", data.id],
      });
      toast.success(isNew ? "FAQ created" : "FAQ saved");
      const slug = slugFromKbId(kbs, data.kb_id);
      if (slug) {
        navigate(kbFaqPath(slug, data.id));
      } else {
        navigate(
          `/mdl/knowledge-base/faqs/${data.id}?kb_id=${encodeURIComponent(data.kb_id)}`
        );
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Save failed");
    },
  });

  const handleCancelEdit = useCallback(() => {
    const slug = slugFromKbId(kbs, selectedKbId);
    if (!slug) {
      navigate(-1);
      return;
    }
    if (isNew) {
      navigate(kbFaqsListPath(slug));
    } else if (id && id !== "new") {
      navigate(kbFaqPath(slug, id));
    } else {
      navigate(-1);
    }
  }, [isNew, id, kbs, navigate, selectedKbId]);

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <Button
          className={topbarIconButtonClassName}
          onClick={handleCancelEdit}
          size="sm"
          variant="outline"
        >
          <X aria-hidden className="h-4 w-4 md:mr-1.5" />
          <TopbarActionLabel>{t("article.actions.cancel")}</TopbarActionLabel>
        </Button>
        {!isNew && id && id !== "new" ? (
          <Button
            className={topbarIconButtonClassName}
            onClick={() => setVersionsDialogOpen(true)}
            size="sm"
            variant="outline"
          >
            <History aria-hidden className="h-4 w-4 md:mr-1.5" />
            <TopbarActionLabel>{t("versions.action")}</TopbarActionLabel>
          </Button>
        ) : null}
        <Button
          className={topbarIconButtonClassName}
          disabled={saveMutation.isPending || !question.trim() || !selectedKbId}
          onClick={() => saveMutation.mutate()}
          size="sm"
        >
          <Save aria-hidden className="h-4 w-4 md:mr-1.5" />
          <TopbarActionLabel>
            {saveMutation.isPending ? t("article.saving") : t("actions.save")}
          </TopbarActionLabel>
        </Button>
      </div>
    ),
    [handleCancelEdit, id, isNew, question, saveMutation, selectedKbId, t]
  );

  const faqListCrumbTo = kbSlugEffective
    ? kbFaqsListPath(kbSlugEffective)
    : `${KB_MODULE_BASE}/faqs`;

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs: [
      ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
      {
        label: t("faq.title"),
        to: faqListCrumbTo,
      },
      {
        label: isNew ? t("faq.new") : (faq?.question ?? "..."),
      },
    ],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  if (!isNew && isLoading) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <div className="kb-article-editor mx-auto w-full max-w-3xl">
          <Skeleton className="h-12 w-96" />
          <Skeleton className="mt-4 h-6 w-48" />
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      </section>
    );
  }

  return (
    <>
      <section className={kbModulePageShellSectionClassName}>
        <div
          className={`kb-article-editor ${kbModulePageShellInnerNarrowClassName} p-2`}
        >
          <input
            className="kb-inline-title"
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t("faq.fields.question")}
            ref={questionRef}
            value={question}
          />

          <div className="kb-properties">
            <div className="kb-properties-fields">
              <div className="kb-property">
                <span className="kb-property-label">
                  {t("faq.fields.status")}
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
                    <SelectItem value="draft">
                      {t("article.status.draft")}
                    </SelectItem>
                    <SelectItem value="published">
                      {t("article.status.published")}
                    </SelectItem>
                    <SelectItem value="archived">
                      {t("article.status.archived")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="kb-property kb-property-wide">
                <span className="kb-property-label">
                  {t("faq.fields.tags")}
                </span>
                <KbTagPicker
                  kbId={selectedKbId}
                  onSelectedTagIdsChange={setSelectedTagIds}
                  selectedTagIds={selectedTagIds}
                />
              </div>
            </div>
          </div>

          <div className="tiptap-rich-editor flex flex-1 flex-col">
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
      </section>
      {!isNew && id && id !== "new" ? (
        <KbEntityVersionsDialog
          entityId={id}
          kind="faq"
          onOpenChange={setVersionsDialogOpen}
          open={versionsDialogOpen}
        />
      ) : null}
    </>
  );
}

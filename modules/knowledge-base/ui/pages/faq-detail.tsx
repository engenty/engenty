/**
 * KB FAQ detail — read-only rich content, same shell pattern as articles.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { markdownToJson, RichEditor } from "@engenty/tiptap-editor";
import "@engenty/tiptap-editor/styles.css";
import type { JSONContent } from "@engenty/tiptap-editor";
import {
  Button,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { Edit, History } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FaqHeaderChrome } from "../components/faq-header-chrome.js";
import { FavoriteStarButton } from "../components/favorite-star-button.js";
import { KbEntityVersionsDialog } from "../components/kb-entity-versions-dialog.js";
import { useKbFaqDetailAgentUiSlice } from "../hooks/use-kb-agent-ui-slice-content.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import {
  KB_MODULE_BASE,
  kbFaqEditPath,
  kbFaqPath,
  kbFaqsListPath,
} from "../kb-paths.js";
import {
  kbModulePageShellInnerNarrowClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import { createKbModuleRichEditorLinkHandler } from "../lib/kb-rich-editor-link-navigation.js";
import { faqDetailQueryOptions, kbsQueryOptions } from "../queries.js";
import { kbIdFromSlug, slugFromKbId } from "../resolve-kb-id.js";

export function FaqDetailPage() {
  const { t } = useTranslation("kb");
  const { kbSlug: kbSlugParam, id } = useParams<{
    kbSlug?: string;
    id: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [versionsOpen, setVersionsOpen] = useState(false);

  const onRichTextLinkClick = useMemo(
    () => createKbModuleRichEditorLinkHandler(navigate),
    [navigate]
  );

  const { data: kbsRaw } = useQuery(kbsQueryOptions);
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];

  const {
    data: faq,
    isLoading,
    error,
  } = useQuery(faqDetailQueryOptions(id ?? ""));
  useKbFaqDetailAgentUiSlice(faq ?? null);

  const canonicalSlug = useMemo(
    () => (faq ? slugFromKbId(kbs, faq.kb_id) : undefined),
    [faq, kbs]
  );

  useEffect(() => {
    if (!(faq && canonicalSlug && id)) {
      return;
    }
    if (kbSlugParam === canonicalSlug) {
      return;
    }
    navigate(`${kbFaqPath(canonicalSlug, faq.id)}${location.search}`, {
      replace: true,
    });
  }, [faq, canonicalSlug, kbSlugParam, id, navigate, location.search]);

  const kbSlug = canonicalSlug ?? kbSlugParam ?? "";

  const kbIdForShell = useMemo(
    () =>
      faq?.kb_id ?? (kbSlugParam ? kbIdFromSlug(kbs, kbSlugParam) : "") ?? "",
    [faq?.kb_id, kbSlugParam, kbs]
  );

  const answerAsJson = useMemo(() => {
    if (faq?.answer_json && typeof faq.answer_json === "object") {
      return faq.answer_json as JSONContent;
    }
    if (!faq?.answer_markdown?.trim()) {
      return null;
    }
    try {
      return markdownToJson(faq.answer_markdown);
    } catch {
      return null;
    }
  }, [faq?.answer_json, faq?.answer_markdown]);

  const onKbPickerChange = useCallback(
    (nextKbId: string) => {
      const slug = slugFromKbId(kbs, nextKbId);
      if (slug) {
        navigate(kbFaqsListPath(slug));
      }
    },
    [kbs, navigate]
  );

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId: kbIdForShell,
    kbSlug,
  });

  const faqListHref = useMemo(() => {
    const slug =
      (faq && slugFromKbId(kbs, faq.kb_id)) ||
      (kbIdForShell ? slugFromKbId(kbs, kbIdForShell) : undefined);
    return slug ? kbFaqsListPath(slug) : `${KB_MODULE_BASE}/faqs`;
  }, [faq, kbs, kbIdForShell]);

  const pageActions = useMemo(
    () =>
      faq && kbSlug ? (
        <div className="flex items-center gap-2">
          <Button
            className={topbarIconButtonClassName}
            onClick={() => setVersionsOpen(true)}
            size="sm"
            variant="outline"
          >
            <History className="h-4 w-4" />
            <TopbarActionLabel>{t("versions.action")}</TopbarActionLabel>
          </Button>
          <FavoriteStarButton
            subtitle={t("faq.title")}
            title={faq.question}
            to={kbFaqPath(kbSlug, faq.id)}
          />
          <Button
            onClick={() => navigate(kbFaqEditPath(kbSlug, faq.id))}
            size="sm"
          >
            <Edit className="mr-1.5 h-4 w-4" />
            {t("faq.edit")}
          </Button>
        </div>
      ) : null,
    [faq, kbSlug, navigate, t]
  );

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs: faq
      ? [
          ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
          { label: t("faq.title"), to: faqListHref },
          { label: faq.question },
        ]
      : [{ label: t("faq.title"), to: faqListHref }, { label: "..." }],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  if (isLoading) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </section>
    );
  }

  if (error || !faq || !id) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <div className="rounded-md border border-red-300/40 bg-red-100/10 p-3 text-red-700 text-sm dark:text-red-300">
          {error instanceof Error ? error.message : "FAQ not found"}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className={kbModulePageShellSectionClassName}>
        <div className={`${kbModulePageShellInnerNarrowClassName} p-2`}>
          <FaqHeaderChrome faq={faq} />

          {answerAsJson ? (
            <RichEditor
              content={answerAsJson}
              editable={false}
              key={faq.id}
              onLinkClick={onRichTextLinkClick}
              showToolbar={false}
            />
          ) : faq.answer_markdown?.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <div className="whitespace-pre-wrap">{faq.answer_markdown}</div>
            </div>
          ) : (
            <p className="text-muted-foreground italic">
              {t("faq.no_answer", "No answer yet.")}
            </p>
          )}
        </div>
      </section>
      <KbEntityVersionsDialog
        entityId={faq.id}
        kind="faq"
        onOpenChange={setVersionsOpen}
        open={versionsOpen}
      />
    </>
  );
}

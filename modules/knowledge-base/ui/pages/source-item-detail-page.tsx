/**
 * KB source item detail — read-only view for a single `kb_source_items` row.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Skeleton } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type SourceItemBodyTab,
  SourceItemContentTabs,
} from "../components/source-item-content-tabs.js";
import { SourceItemDetailError } from "../components/source-item-detail-error.js";
import {
  SourceItemDetailHeader,
  sourceItemHeadingTitle,
} from "../components/source-item-detail-header.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import {
  KB_MODULE_BASE,
  kbSourceItemPath,
  kbSourcePath,
  kbSourcesPath,
} from "../kb-paths.js";
import {
  kbModulePageShellInnerClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import { createKbModuleRichEditorLinkHandler } from "../lib/kb-rich-editor-link-navigation.js";
import {
  inboxDetailQueryOptions,
  kbSourceItemDetailQueryOptions,
  kbsQueryOptions,
} from "../queries.js";
import { kbIdFromSlug, slugFromKbId } from "../resolve-kb-id.js";

export function SourceItemDetailPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const [bodyViewTab, setBodyViewTab] = useState<SourceItemBodyTab>("parsed");
  const { itemId, kbSlug: kbSlugParam } = useParams<{
    itemId: string;
    kbSlug?: string;
  }>();

  const { data: kbsRaw, isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];
  const kbIdFromUrl = useMemo(
    () => (kbSlugParam ? kbIdFromSlug(kbs, kbSlugParam) : null),
    [kbSlugParam, kbs]
  );

  const {
    data: payload,
    error: detailError,
    isLoading: detailLoading,
  } = useQuery(kbSourceItemDetailQueryOptions(itemId ?? ""));

  const item = payload?.item;
  const parentSource = payload?.source;
  const sections = payload?.sections ?? [];
  const media = payload?.media ?? [];
  const links = payload?.links ?? [];

  const inboxId = item?.inbox_item_id ?? "";
  const { data: inboxItem, isLoading: inboxBodyLoading } = useQuery({
    ...inboxDetailQueryOptions(inboxId),
    enabled: Boolean(inboxId),
  });

  const metadataForJsonPanel = useMemo(() => {
    const raw = item?.metadata ?? {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        ([key]) =>
          ![
            "probe_etag",
            "probe_last_modified",
            "raw_html",
            "raw_markdown",
          ].includes(key)
      )
    );
  }, [item?.metadata]);

  const markdownBody = useMemo(() => {
    const fromInbox = inboxItem?.raw_markdown?.trim();
    if (fromInbox) {
      return fromInbox;
    }
    const meta = item?.metadata?.raw_markdown;
    return typeof meta === "string" ? meta.trim() : "";
  }, [inboxItem?.raw_markdown, item?.metadata]);

  const rawHtmlBody = useMemo(() => {
    const fromInbox = inboxItem?.raw_text?.trim();
    if (fromInbox) {
      return fromInbox;
    }
    const fromInboxMeta = inboxItem?.metadata?.raw_html;
    if (typeof fromInboxMeta === "string" && fromInboxMeta.trim()) {
      return fromInboxMeta.trim();
    }
    const meta = item?.metadata?.raw_html;
    return typeof meta === "string" ? meta.trim() : "";
  }, [inboxItem?.metadata, inboxItem?.raw_text, item?.metadata]);

  useEffect(() => {
    setBodyViewTab("parsed");
  }, [itemId]);

  const canonicalSlug = useMemo(
    () => (parentSource ? slugFromKbId(kbs, parentSource.kb_id) : undefined),
    [kbs, parentSource]
  );

  useEffect(() => {
    if (!(itemId && parentSource && canonicalSlug)) {
      return;
    }
    if (kbSlugParam === canonicalSlug) {
      return;
    }
    navigate(kbSourceItemPath(canonicalSlug, itemId), { replace: true });
  }, [canonicalSlug, itemId, kbSlugParam, navigate, parentSource]);

  const kbSlug = canonicalSlug ?? kbSlugParam ?? "";
  const kbId = parentSource?.kb_id ?? kbIdFromUrl ?? "";

  useEffect(() => {
    if (!kbsLoading && kbSlugParam && !kbIdFromUrl && !parentSource) {
      navigate(KB_MODULE_BASE, { replace: true });
    }
  }, [kbIdFromUrl, kbSlugParam, kbsLoading, navigate, parentSource]);

  const navigateKb = useCallback(
    (nextKbId: string) => {
      const nextSlug = slugFromKbId(kbs, nextKbId);
      if (nextSlug) {
        navigate(kbSourcesPath(nextSlug));
      }
    },
    [kbs, navigate]
  );

  const sourcesListHref = kbSlug ? kbSourcesPath(kbSlug) : KB_MODULE_BASE;
  const parentSourceHref =
    kbSlug && parentSource
      ? kbSourcePath(kbSlug, parentSource.id)
      : sourcesListHref;

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId: kbId || "",
    kbSlug: kbSlug || "",
    onKbChange: navigateKb,
  });

  const onRichTextLinkClick = useMemo(
    () => createKbModuleRichEditorLinkHandler(navigate),
    [navigate]
  );

  const itemTitle = item ? sourceItemHeadingTitle(item) : "…";

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: null,
    breadcrumbs:
      item && parentSource
        ? [
            ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
            { label: t("sources.title"), to: sourcesListHref },
            { label: parentSource.name, to: parentSourceHref },
            { label: itemTitle },
          ]
        : [
            ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
            { label: t("sources.title"), to: sourcesListHref },
            { label: "…" },
          ],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  if (kbsLoading || (detailLoading && !detailError)) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="mt-4 h-40 w-full" />
      </section>
    );
  }

  if (detailError || !item || !parentSource || !itemId) {
    const backAction =
      kbSlug && parentSource
        ? {
            label: t("sources.back_to_source"),
            onBack: () => navigate(parentSourceHref),
          }
        : kbSlug
          ? {
              label: t("sources.back_to_list"),
              onBack: () => navigate(sourcesListHref),
            }
          : null;

    return (
      <SourceItemDetailError
        backLabel={backAction?.label ?? null}
        errorMessage={
          detailError instanceof Error
            ? detailError.message
            : t("sources.source_item_not_found")
        }
        onBack={backAction?.onBack ?? null}
      />
    );
  }

  return (
    <section className={kbModulePageShellSectionClassName}>
      <div className={kbModulePageShellInnerClassName}>
        <SourceItemDetailHeader
          extraMetadata={metadataForJsonPanel}
          item={item}
          kbSlug={kbSlug}
        />

        <div className="flex w-full min-w-0 flex-col gap-2">
          <SourceItemContentTabs
            activeTab={bodyViewTab}
            inboxBodyLoading={inboxBodyLoading && Boolean(item.inbox_item_id)}
            links={links}
            markdownBody={markdownBody}
            media={media}
            onLinkClick={onRichTextLinkClick}
            onTabChange={setBodyViewTab}
            rawHtmlBody={rawHtmlBody}
            sections={sections}
          />
        </div>
      </div>
    </section>
  );
}

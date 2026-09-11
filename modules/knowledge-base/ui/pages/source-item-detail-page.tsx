/**
 * KB source item detail — read-only view for a single `kb_source_items` row.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Skeleton } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useEffect, useMemo, useState } from "react";
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
import { kbSourcePath, kbSourcesPath } from "../kb-paths.js";
import {
  kbModulePageShellInnerClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import { createKbModuleRichEditorLinkHandler } from "../lib/kb-rich-editor-link-navigation.js";
import {
  inboxDetailQueryOptions,
  kbSourceItemDetailQueryOptions,
  useKbsQuery,
} from "../queries.js";
import { spaceKbId } from "../resolve-kb-id.js";

export function SourceItemDetailPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const [bodyViewTab, setBodyViewTab] = useState<SourceItemBodyTab>("parsed");
  const { itemId } = useParams<{ itemId: string }>();

  const { data: kbsRaw, isLoading: kbsLoading } = useKbsQuery();
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];
  const kbIdFromUrl = useMemo(() => spaceKbId(kbs), [kbs]);

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

  const kbId = parentSource?.kb_id ?? kbIdFromUrl ?? "";

  const sourcesListHref = kbSourcesPath();
  const parentSourceHref = parentSource
    ? kbSourcePath(parentSource.id)
    : sourcesListHref;

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId: kbId || "",
  });

  const onRichTextLinkClick = useMemo(
    () => createKbModuleRichEditorLinkHandler(navigate),
    [navigate]
  );

  const itemTitle = item ? sourceItemHeadingTitle(item) : "…";

  usePageConfig({
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
    const backAction = parentSource
      ? {
          label: t("sources.back_to_source"),
          onBack: () => navigate(parentSourceHref),
        }
      : {
          label: t("sources.back_to_list"),
          onBack: () => navigate(sourcesListHref),
        };

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

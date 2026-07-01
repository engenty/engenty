/**
 * KB dynamic source edit — dedicated route using the same form as the list dialog.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Button, Skeleton } from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  type SourceAdapterDialogInput,
  SourceAdapterEditor,
  type SourceAdapterEditorHandle,
} from "../components/source-adapter-editor.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import {
  KB_MODULE_BASE,
  kbSourceEditPath,
  kbSourcePath,
  kbSourcesPath,
} from "../kb-paths.js";
import { mergeKbSourceAdaptersForPicker } from "../kb-source-adapters-merge.js";
import {
  kbModulePageShellInnerClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import {
  kbSourceDetailQueryOptions,
  kbsQueryOptions,
  sourceAdaptersQueryOptions,
  useKbSourceMutations,
} from "../queries.js";
import { kbIdFromSlug, slugFromKbId } from "../resolve-kb-id.js";

export function SourceEditPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const editorRef = useRef<SourceAdapterEditorHandle>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const { kbSlug: kbSlugParam, sourceId } = useParams<{
    kbSlug?: string;
    sourceId: string;
  }>();

  const { data: kbsRaw, isLoading: kbsLoading } = useQuery(kbsQueryOptions);
  const { data: adaptersRaw = [] } = useQuery(sourceAdaptersQueryOptions);
  const adapters = useMemo(
    () => mergeKbSourceAdaptersForPicker(adaptersRaw),
    [adaptersRaw]
  );
  const kbs = Array.isArray(kbsRaw) ? kbsRaw : [];
  const kbIdFromUrl = useMemo(
    () => (kbSlugParam ? kbIdFromSlug(kbs, kbSlugParam) : null),
    [kbSlugParam, kbs]
  );

  const {
    data: detail,
    isLoading: detailLoading,
    error: detailError,
  } = useQuery(kbSourceDetailQueryOptions(sourceId ?? ""));
  const source = detail?.data;

  const canonicalSlug = useMemo(
    () => (source ? slugFromKbId(kbs, source.kb_id) : undefined),
    [kbs, source]
  );

  useEffect(() => {
    if (!(source && canonicalSlug && sourceId)) {
      return;
    }
    if (kbSlugParam === canonicalSlug) {
      return;
    }
    navigate(kbSourceEditPath(canonicalSlug, sourceId), { replace: true });
  }, [canonicalSlug, kbSlugParam, navigate, source, sourceId]);

  const kbSlug = canonicalSlug ?? kbSlugParam ?? "";
  const kbId = source?.kb_id ?? kbIdFromUrl ?? "";

  const listQuery = useMemo(
    () =>
      kbId
        ? {
            kb_id: kbId,
            page: 1,
            page_size: 25,
            sort_by: "updated_at" as const,
            sort_order: "desc" as const,
          }
        : undefined,
    [kbId]
  );
  const mutations = useKbSourceMutations(listQuery);

  useEffect(() => {
    if (source?.id) {
      setCanSubmit(false);
    }
  }, [source?.id]);

  useEffect(() => {
    if (!kbsLoading && kbSlugParam && !kbIdFromUrl && !source) {
      navigate(KB_MODULE_BASE, { replace: true });
    }
  }, [kbIdFromUrl, kbSlugParam, kbsLoading, navigate, source]);

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
  const detailHref =
    kbSlug && sourceId ? kbSourcePath(kbSlug, sourceId) : sourcesListHref;

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId: kbId || "",
    kbSlug: kbSlug || "",
    onKbChange: navigateKb,
  });

  const pageActions = useMemo(() => {
    if (!source) {
      return null;
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => navigate(detailHref)}
          size="sm"
          type="button"
          variant="outline"
        >
          {t("sources.cancel")}
        </Button>
        <Button
          disabled={!canSubmit || mutations.update.isPending}
          onClick={() => editorRef.current?.submit()}
          size="sm"
          type="button"
        >
          {t("sources.save")}
        </Button>
      </div>
    );
  }, [canSubmit, detailHref, mutations.update.isPending, navigate, source, t]);

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: pageActions,
    breadcrumbs: source
      ? [
          ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
          { label: t("sources.title"), to: sourcesListHref },
          { label: source.name, to: detailHref },
          { label: t("sources.edit") },
        ]
      : [
          { label: t("sources.title"), to: sourcesListHref },
          { label: "…" },
          { label: t("sources.edit") },
        ],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  const submit = async (input: SourceAdapterDialogInput) => {
    if (!source) {
      return;
    }
    try {
      await mutations.update.mutateAsync({ id: source.id, input });
      toast.success(t("sources.updated"));
      navigate(kbSourcePath(kbSlug, source.id));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("sources.save_failed")
      );
    }
  };

  if (kbsLoading || (detailLoading && !detailError)) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <div className={kbModulePageShellInnerClassName}>
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="mt-4 h-96 w-full" />
        </div>
      </section>
    );
  }

  if (detailError || !source || !sourceId) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <div className={`${kbModulePageShellInnerClassName} gap-3`}>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
            {detailError instanceof Error
              ? detailError.message
              : t("sources.source_not_found")}
          </div>
          <Button
            onClick={() => navigate(sourcesListHref)}
            type="button"
            variant="outline"
          >
            {t("sources.back_to_list")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className={`${kbModulePageShellSectionClassName} pb-10`}>
      <div className={kbModulePageShellInnerClassName}>
        <h1 className="font-semibold text-xl tracking-tight">
          {t("sources.edit_source")}
        </h1>
        <div>
          <SourceAdapterEditor
            active
            adapters={adapters}
            inlineFooter={false}
            onCancel={() => navigate(detailHref)}
            onCanSubmitChange={setCanSubmit}
            onSubmit={submit}
            ref={editorRef}
            saving={mutations.update.isPending}
            source={source}
            variant="page"
          />
        </div>
      </div>
    </section>
  );
}

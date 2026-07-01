/**
 * KB Source Setup Wizard — 3-step guided ingestion flow.
 * Step 1: Browse/filter index and select items.
 * Step 2: Choose retrieve options and confirm.
 * Redirects to source detail page after step 2 kicks off the run.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery } from "@engenty/query-client";
import {
  Button,
  Checkbox,
  Skeleton,
  TopbarActionLabel,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { listKbSourceIndex, runKbSourceNow } from "../api.js";
import { SourceIndexBrowser } from "../components/source-index-browser.js";
import { useKbModuleSecondaryShellNav } from "../hooks/use-kb-module-secondary-shell-nav.js";
import { KB_MODULE_BASE, kbSourcePath, kbSourcesPath } from "../kb-paths.js";
import { mergeKbSourceAdaptersForPicker } from "../kb-source-adapters-merge.js";
import {
  kbModulePageShellInnerNarrowClassName,
  kbModulePageShellSectionClassName,
} from "../lib/kb-page-shell.js";
import {
  kbSourceDetailQueryOptions,
  kbsQueryOptions,
  sourceAdaptersQueryOptions,
} from "../queries.js";
import { kbIdFromSlug, slugFromKbId } from "../resolve-kb-id.js";

type WizardStep = 1 | 2;

export function SourceSetupWizardPage() {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const { kbSlug: kbSlugParam, sourceId } = useParams<{
    kbSlug?: string;
    sourceId: string;
  }>();

  const [step, setStep] = useState<WizardStep>(1);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [retrieveImages, setRetrieveImages] = useState(false);

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

  const { data: detail, isLoading: detailLoading } = useQuery(
    kbSourceDetailQueryOptions(sourceId ?? "")
  );
  const source = detail?.data;

  const canonicalSlug = useMemo(
    () => (source ? slugFromKbId(kbs, source.kb_id) : undefined),
    [kbs, source]
  );
  const kbSlug = canonicalSlug ?? kbSlugParam ?? "";
  const kbId = source?.kb_id ?? kbIdFromUrl ?? "";

  const {
    data: indexData,
    isLoading: indexLoading,
    error: indexError,
  } = useQuery({
    queryKey: ["kb", "sources", "index", sourceId],
    queryFn: ({ signal }) =>
      listKbSourceIndex(sourceId!, { limit: 500, signal }),
    enabled: !!sourceId,
    staleTime: 30_000,
  });

  const runMutation = useMutation({
    mutationFn: (opts: {
      sourceId: string;
      selectedKeys: string[];
      retrieveImages: boolean;
    }) =>
      runKbSourceNow(opts.sourceId, {
        selected_item_keys:
          opts.selectedKeys.length > 0 ? opts.selectedKeys : undefined,
        retrieve_images: opts.retrieveImages,
        trigger: "manual",
      }),
    onSuccess: () => {
      toast.success(t("sources.setup_wizard_run_started"));
      navigate(kbSourcePath(kbSlug, sourceId!));
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t("sources.setup_wizard_run_failed")
      );
    },
  });

  const adapterLabel = useMemo(() => {
    if (!source) {
      return "";
    }
    return (
      adapters.find((a) => a.id === source.adapter_id)?.label ??
      source.adapter_id.replaceAll("_", " ")
    );
  }, [adapters, source]);

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

  const kbShellNav = useKbModuleSecondaryShellNav({
    kbId: kbId || "",
    kbSlug: kbSlug || "",
    onKbChange: navigateKb,
  });

  const cancelAction = useMemo(
    () =>
      source && kbSlug ? (
        <Button
          className={topbarIconButtonClassName}
          onClick={() => navigate(kbSourcePath(kbSlug, source.id))}
          size="sm"
          type="button"
          variant="outline"
        >
          <X className="h-4 w-4" />
          <TopbarActionLabel>{t("actions.cancel")}</TopbarActionLabel>
        </Button>
      ) : null,
    [kbSlug, navigate, source, t]
  );

  usePageConfig({
    topbarChrome: "contentBlend",
    contentStackBackground: "paper",
    actions: cancelAction,
    breadcrumbs: source
      ? [
          ...(kbShellNav.kbRootCrumb ? [kbShellNav.kbRootCrumb] : []),
          { label: t("sources.title"), to: sourcesListHref },
          {
            label: source.name,
            to: kbSourcePath(kbSlug, source.id),
          },
          { label: t("sources.setup_wizard_title") },
        ]
      : [
          { label: t("sources.title"), to: sourcesListHref },
          { label: t("sources.setup_wizard_title") },
        ],
    secondaryNavAfterItems: kbShellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: kbShellNav.secondaryNavHeaderSlot,
  });

  if (kbsLoading || detailLoading) {
    return (
      <section className={kbModulePageShellSectionClassName}>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="mt-4 h-40 w-full" />
      </section>
    );
  }

  if (!(source && sourceId)) {
    return (
      <section className={`${kbModulePageShellSectionClassName} gap-3`}>
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
          {t("sources.source_not_found")}
        </div>
      </section>
    );
  }

  const entries = indexData?.entries ?? [];
  const total = indexData?.total ?? 0;

  return (
    <section className={kbModulePageShellSectionClassName}>
      <div className={kbModulePageShellInnerNarrowClassName}>
        {/* Step indicator */}
        <div className="flex items-center gap-2 text-sm">
          <StepBadge active={step === 1} completed={step > 1} index={1} />
          <span
            className={
              step === 1
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }
          >
            {t("sources.setup_wizard_step1_label")}
          </span>
          <span className="mx-1 text-muted-foreground">→</span>
          <StepBadge active={step === 2} completed={false} index={2} />
          <span
            className={
              step === 2
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }
          >
            {t("sources.setup_wizard_step2_label")}
          </span>
        </div>

        {/* Step 1: Index browser */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-semibold text-base">
                {t("sources.setup_wizard_step1_title")}
              </h2>
              <p className="mt-0.5 text-muted-foreground text-sm">
                {t("sources.setup_wizard_step1_desc", {
                  adapter: adapterLabel,
                  name: source.name,
                })}
              </p>
            </div>

            {indexError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">
                {indexError instanceof Error
                  ? indexError.message
                  : t("sources.setup_wizard_index_error")}
              </div>
            ) : (
              <SourceIndexBrowser
                entries={entries}
                isLoading={indexLoading}
                onSelectionChange={(keys) => setSelectedKeys(new Set(keys))}
                selectedKeys={selectedKeys}
                total={total}
              />
            )}

            <div className="flex items-center justify-between pt-2">
              <Button
                onClick={() => navigate(kbSourcePath(kbSlug, source.id))}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={indexLoading || !!indexError}
                onClick={() => setStep(2)}
                size="sm"
                type="button"
              >
                {t("sources.setup_wizard_next")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Options + confirm */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="font-semibold text-base">
                {t("sources.setup_wizard_step2_title")}
              </h2>
              <p className="mt-0.5 text-muted-foreground text-sm">
                {selectedKeys.size > 0
                  ? t("sources.setup_wizard_step2_selected_desc", {
                      count: selectedKeys.size,
                    })
                  : t("sources.setup_wizard_step2_all_desc", {
                      count: entries.length,
                    })}
              </p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-col gap-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={retrieveImages}
                    className="mt-0.5"
                    id="retrieve-images"
                    onCheckedChange={(v) => setRetrieveImages(!!v)}
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm">
                      {t("sources.setup_wizard_retrieve_images_label")}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t("sources.setup_wizard_retrieve_images_desc")}
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                onClick={() => setStep(1)}
                size="sm"
                type="button"
                variant="outline"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                {t("sources.setup_wizard_back")}
              </Button>
              <Button
                disabled={runMutation.isPending}
                onClick={() =>
                  runMutation.mutate({
                    retrieveImages,
                    selectedKeys: [...selectedKeys],
                    sourceId: source.id,
                  })
                }
                size="sm"
                type="button"
              >
                <Check className="mr-1 h-4 w-4" />
                {runMutation.isPending
                  ? t("sources.running")
                  : t("sources.setup_wizard_retrieve_confirm")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function StepBadge({
  active,
  completed,
  index,
}: {
  active: boolean;
  completed: boolean;
  index: number;
}) {
  return (
    <span
      className={[
        "flex h-6 w-6 items-center justify-center rounded-full font-semibold text-xs",
        active
          ? "bg-primary text-primary-foreground"
          : completed
            ? "bg-primary/20 text-primary"
            : "bg-muted text-muted-foreground",
      ].join(" ")}
    >
      {completed ? <Check className="h-3 w-3" /> : index}
    </span>
  );
}

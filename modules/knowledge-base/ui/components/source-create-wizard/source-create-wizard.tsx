/**
 * KB "add source" wizard.
 *
 * Adding a source used to be a dropdown of adapter ids feeding a dialog: you
 * had to know which adapter you wanted, what its settings meant, and how the
 * result should be filed — all before seeing a single line of the material.
 * This asks those questions in the order they can actually be answered, and
 * puts a real fetch in the middle so the last question is answered against
 * evidence rather than a guess.
 *
 * The source is created at the fetch step, not at the end: the analyzer and
 * the item preview both need a real source to read. Abandoning the wizard
 * after that point leaves a valid, un-armed source behind rather than a
 * half-written draft in some parallel table.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { useQuery, useQueryClient } from "@engenty/query-client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { KbSourceAdapterId } from "../../../src/schema/types.js";
import {
  convertKbDocument,
  createKbSource,
  getKbSource,
  ingestKbSource,
  type KbSourceIndexEntry,
  previewKbSourceIndex,
  runKbSourceNow,
  updateKbSource,
} from "../../api.js";
import { kbSourcePath } from "../../kb-paths.js";
import { mergeKbSourceAdaptersForPicker } from "../../kb-source-adapters-merge.js";
import {
  defaultKbSourceWizardPlan,
  type KbSourceWizardPlan,
  type KbSourceWizardStepId,
  kbCreatedSourceId,
  kbSourceWizardIngestConfig,
  kbSourceWizardPreviousStep,
  kbSourceWizardRemainingCount,
  kbSourceWizardSampleKeys,
  kbSourceWizardSteps,
  kbSourceWizardStrategy,
} from "../../lib/source-create-wizard.js";
import {
  kbArticleKeys,
  kbInboxKeys,
  kbSourceItemsQueryOptions,
  kbSourceKeys,
  sourceAdaptersQueryOptions,
} from "../../queries.js";
import {
  type SourceAdapterDialogInput,
  SourceAdapterEditor,
  type SourceAdapterEditorHandle,
} from "../source-adapter-editor.js";
import { WizardStepFetch } from "./step-fetch.js";
import { WizardStepFiles } from "./step-files.js";
import { WizardStepManual } from "./step-manual.js";
import { WizardStepPlan } from "./step-plan.js";
import { WizardStepSelect } from "./step-select.js";
import { WizardStepType } from "./step-type.js";
import { WizardFooter, WizardRail, WizardStepHeader } from "./wizard-chrome.js";

const FETCH_PREVIEW_ITEM_LIMIT = 20;
const ITEMS_REFETCH_MS = 2000;
const RUN_POLL_INTERVAL_MS = 2000;
const RUN_POLL_TIMEOUT_MS = 240_000;

const IDLE_SCHEDULE = {
  cron_expression: null,
  enabled: false,
  interval_minutes: null,
  kind: "interval",
  timezone: "UTC",
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a background run to settle. Bounded, because a run that never
 * reports back must not leave the wizard spinning forever — the source exists
 * either way and its own page keeps showing progress.
 */
async function waitForSourceRun(sourceId: string): Promise<void> {
  const deadline = Date.now() + RUN_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(RUN_POLL_INTERVAL_MS);
    const { data } = await getKbSource(sourceId);
    if (data.last_run_status !== "running") {
      return;
    }
  }
}

export interface SourceCreateWizardProps {
  kbId: string;
  /** Dismiss the host (dialog or page) without finishing. */
  onClose: () => void;
}

export function SourceCreateWizard({ kbId, onClose }: SourceCreateWizardProps) {
  const { t } = useTranslation("kb");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: adaptersRaw = [] } = useQuery(sourceAdaptersQueryOptions);
  const adapters = useMemo(
    () => mergeKbSourceAdaptersForPicker(adaptersRaw),
    [adaptersRaw]
  );

  const [step, setStep] = useState<KbSourceWizardStepId>("type");
  const [adapterId, setAdapterId] = useState<string | null>(null);
  const adapter = adapters.find((item) => item.id === adapterId);
  const steps = useMemo(() => kbSourceWizardSteps(adapter), [adapter]);

  const editorRef = useRef<SourceAdapterEditorHandle | null>(null);
  const [draftInput, setDraftInput] = useState<SourceAdapterDialogInput | null>(
    null
  );
  const [editorReady, setEditorReady] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [manualTitle, setManualTitle] = useState("");
  const [manualBody, setManualBody] = useState("");

  const [indexEntries, setIndexEntries] = useState<KbSourceIndexEntry[]>([]);
  const [indexTotal, setIndexTotal] = useState(0);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // Ref as well as state: the retry path must know what already exists
  // without waiting for a re-render, or it creates the source a second time.
  const createdIdsRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  const [createdSourceIds, setCreatedSourceIds] = useState<string[]>([]);
  const [fetchBusy, setFetchBusy] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [plan, setPlan] = useState<KbSourceWizardPlan>(
    defaultKbSourceWizardPlan
  );
  const [finishing, setFinishing] = useState(false);

  const isManual = adapterId === "manual";
  const isFiles = adapterId === "file_upload";
  const primarySourceId = createdSourceIds[0] ?? "";
  const selectedKeyList = useMemo(() => [...selectedKeys], [selectedKeys]);
  const remainingCount = kbSourceWizardRemainingCount(selectedKeyList);

  // One query answers two questions: what the fetch step lists, and whether
  // the analyzer on the plan step has anything to read.
  const { data: itemsPage } = useQuery({
    ...kbSourceItemsQueryOptions({
      page: 1,
      page_size: FETCH_PREVIEW_ITEM_LIMIT,
      sourceId: primarySourceId,
    }),
    refetchInterval: fetchBusy ? ITEMS_REFETCH_MS : false,
  });
  const fetchedItems = useMemo(() => itemsPage?.data ?? [], [itemsPage?.data]);
  const readyItemIds = useMemo(
    () =>
      new Set(
        fetchedItems
          .filter(
            (item) =>
              item.content_hash ||
              (typeof item.metadata.section_count === "number" &&
                item.metadata.section_count > 0) ||
              item.inbox_item_id
          )
          .map((item) => item.id)
      ),
    [fetchedItems]
  );

  /** The source rows this wizard needs, created once and reused on retry. */
  const createSources = useCallback(
    async (input?: SourceAdapterDialogInput): Promise<string[]> => {
      if (isManual) {
        const name = manualTitle.trim() || t("sources.wizard_manual_fallback");
        const created = await createKbSource({
          adapter_id: "manual",
          enabled: false,
          kb_id: kbId,
          missing_item_strategy: "ignore",
          name,
          schedule: { ...IDLE_SCHEDULE },
          settings: { body_markdown: manualBody, title: name },
          status: "active",
        });
        return [kbCreatedSourceId(created)];
      }
      if (isFiles) {
        const ids: string[] = [];
        for (const file of files) {
          const converted = await convertKbDocument(file, { kbId });
          if (!converted.storage_object_key) {
            throw new Error(
              t("sources.wizard_files_store_failed", { name: file.name })
            );
          }
          const created = await createKbSource({
            adapter_id: "file_upload",
            enabled: false,
            kb_id: kbId,
            missing_item_strategy: "ignore",
            name: file.name.replace(/\.[^/.]+$/, "") || file.name,
            schedule: { ...IDLE_SCHEDULE },
            settings: {
              body_markdown: converted.markdown,
              original_filename: converted.original_filename,
              storage_object_key: converted.storage_object_key,
            },
            status: "active",
          });
          ids.push(kbCreatedSourceId(created));
        }
        return ids;
      }
      // The editor hands its form straight to this call: reading it back from
      // state would see the value from before `submit()` ran.
      const form = input ?? draftInput;
      if (!form) {
        throw new Error(t("sources.save_failed"));
      }
      const ignored = indexEntries
        .filter((entry) => !selectedKeys.has(entry.item_key))
        .map((entry) => entry.item_key);
      const created = await createKbSource({
        ...form,
        adapter_id: form.adapter_id as KbSourceAdapterId,
        ignored_item_keys: ignored,
        initial_index_entries:
          indexEntries.length > 0 ? indexEntries : undefined,
        kb_id: kbId,
        status: "active",
      });
      return [kbCreatedSourceId(created)];
    },
    [
      draftInput,
      files,
      indexEntries,
      isFiles,
      isManual,
      kbId,
      manualBody,
      manualTitle,
      selectedKeys,
      t,
    ]
  );

  /**
   * Creates the source(s) and fetches the sample the plan step reads. Safe to
   * call again after a failure: whatever was already created is reused, so a
   * retry resumes the run instead of adding a duplicate source.
   */
  const startCreation = useCallback(
    async (input?: SourceAdapterDialogInput) => {
      if (runningRef.current || !kbId) {
        return;
      }
      runningRef.current = true;
      setFetchBusy(true);
      setFetchError(null);
      try {
        if (createdIdsRef.current.length === 0) {
          const ids = await createSources(input);
          createdIdsRef.current = ids;
          setCreatedSourceIds(ids);
        }
        // Manual entries and uploads carry their text from the moment they are
        // created — there is nothing to go and fetch.
        const primary = createdIdsRef.current[0];
        if (primary && !(isManual || isFiles)) {
          const sample = kbSourceWizardSampleKeys(selectedKeyList);
          await runKbSourceNow(primary, {
            background: true,
            trigger: "manual",
            ...(sample.length > 0 ? { selected_item_keys: sample } : {}),
          });
          await waitForSourceRun(primary);
        }
        await queryClient.invalidateQueries({ queryKey: kbSourceKeys.all });
      } catch (error) {
        setFetchError(
          error instanceof Error ? error.message : t("sources.save_failed")
        );
      } finally {
        runningRef.current = false;
        setFetchBusy(false);
      }
    },
    [createSources, isFiles, isManual, kbId, queryClient, selectedKeyList, t]
  );

  const goToFetch = useCallback(() => {
    setStep("fetch");
    void startCreation();
  }, [startCreation]);

  const loadIndexPreview = useCallback(
    async (input: SourceAdapterDialogInput) => {
      setIndexLoading(true);
      setIndexError(null);
      try {
        const index = await previewKbSourceIndex({
          adapter_id: input.adapter_id,
          name: input.name,
          settings: input.settings,
        });
        setIndexEntries(index.entries);
        setIndexTotal(index.total);
        setSelectedKeys(new Set(index.entries.map((entry) => entry.item_key)));
      } catch (error) {
        setIndexError(
          error instanceof Error ? error.message : t("sources.index_load_error")
        );
      } finally {
        setIndexLoading(false);
      }
    },
    [t]
  );

  /** The adapter editor reports its form synchronously when `submit()` runs. */
  const handleEditorSubmit = useCallback(
    (input: SourceAdapterDialogInput) => {
      setDraftInput(input);
      if (adapter?.index_mode === "review") {
        setStep("select");
        void loadIndexPreview(input);
        return;
      }
      setStep("fetch");
      void startCreation(input);
    },
    [adapter?.index_mode, loadIndexPreview, startCreation]
  );

  const finish = useCallback(async () => {
    if (createdSourceIds.length === 0) {
      return;
    }
    setFinishing(true);
    try {
      const ingest_config = kbSourceWizardIngestConfig(plan);
      for (const id of createdSourceIds) {
        await updateKbSource(id, { ingest_config });
      }
      if (plan.active) {
        // Armed: the sync's completion hook runs the ingest, so one full sync
        // both finishes the fetch and produces the articles.
        for (const id of createdSourceIds) {
          await runKbSourceNow(id, { background: true, trigger: "manual" });
        }
        toast.success(t("sources.wizard_finish_armed"));
      } else if (remainingCount > 0) {
        for (const id of createdSourceIds) {
          await runKbSourceNow(id, { background: true, trigger: "manual" });
        }
        toast.success(t("sources.wizard_finish_fetching"));
      } else {
        const strategy = kbSourceWizardStrategy(plan);
        for (const id of createdSourceIds) {
          await ingestKbSource(id, { strategy });
        }
        toast.success(t("sources.wizard_finish_ingested"));
      }
      // Scoped: an unfiltered invalidate refetches every query in the app —
      // shell, spaces, copilot threads — for a change that only touches this
      // module's sources, articles and inbox.
      for (const queryKey of [
        kbSourceKeys.all,
        kbArticleKeys.all,
        kbInboxKeys.all,
      ]) {
        await queryClient.invalidateQueries({ queryKey });
      }
      navigate(kbSourcePath(primarySourceId));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("sources.save_failed")
      );
    } finally {
      setFinishing(false);
    }
  }, [
    createdSourceIds,
    navigate,
    plan,
    primarySourceId,
    queryClient,
    remainingCount,
    t,
  ]);

  const handleNext = useCallback(() => {
    if (step === "type") {
      setStep("configure");
      return;
    }
    if (step === "configure") {
      if (isManual || isFiles) {
        goToFetch();
        return;
      }
      editorRef.current?.submit();
      return;
    }
    if (step === "select") {
      goToFetch();
      return;
    }
    if (step === "fetch") {
      setStep("plan");
      return;
    }
    void finish();
  }, [finish, goToFetch, isFiles, isManual, step]);

  const handleBack = useCallback(() => {
    setStep((current) => kbSourceWizardPreviousStep(steps, current));
  }, [steps]);

  const nextDisabled = (() => {
    if (step === "type") {
      return !adapterId;
    }
    if (step === "configure") {
      if (isManual) {
        return manualTitle.trim().length === 0;
      }
      if (isFiles) {
        return files.length === 0;
      }
      return !editorReady;
    }
    if (step === "select") {
      return indexLoading || !!indexError || selectedKeys.size === 0;
    }
    if (step === "fetch") {
      return fetchBusy || createdSourceIds.length === 0;
    }
    return createdSourceIds.length === 0;
  })();

  const nextLabel = (() => {
    if (step === "configure" && !(isManual || isFiles)) {
      return adapter?.index_mode === "review"
        ? t("sources.create_index")
        : t("sources.wizard_create_and_fetch");
    }
    if (step === "configure") {
      return t("sources.wizard_create_and_fetch");
    }
    if (step === "plan") {
      return plan.active
        ? t("sources.wizard_finish_armed_action")
        : t("sources.wizard_finish_action");
    }
    return;
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <WizardRail current={step} steps={steps} />
      {/* Only the step body scrolls: the rail stays visible so the user can
          see where they are, and the footer stays reachable without hunting
          for it at the bottom of a long plan step. */}
      <div className="-mr-2 min-h-0 flex-1 space-y-6 overflow-y-auto pr-2">
        {step === "type" ? (
          <WizardStepType
            adapters={adapters}
            onSelect={(nextId) => {
              setAdapterId(nextId);
              setDraftInput(null);
              setIndexEntries([]);
              setSelectedKeys(new Set());
              setStep("configure");
            }}
            selectedAdapterId={adapterId}
          />
        ) : null}

        {/* The adapter editor stays mounted across steps: unmounting it would
            throw away everything typed the moment the user steps back. */}
        <div hidden={!(step === "configure" && !(isManual || isFiles))}>
          {adapterId && !(isManual || isFiles) ? (
            <div className="flex flex-col gap-4">
              <WizardStepHeader
                description={t("sources.wizard_configure_desc")}
                title={t("sources.wizard_configure_title")}
              />
              <SourceAdapterEditor
                active
                adapters={adapters}
                inlineFooter={false}
                onCancel={onClose}
                onCanSubmitChange={setEditorReady}
                onSubmit={handleEditorSubmit}
                presetAdapterId={adapterId}
                ref={editorRef}
                variant="page"
              />
            </div>
          ) : null}
        </div>

        {step === "configure" && isManual ? (
          <WizardStepManual
            body={manualBody}
            onBodyChange={setManualBody}
            onTitleChange={setManualTitle}
            title={manualTitle}
          />
        ) : null}

        {step === "configure" && isFiles ? (
          <WizardStepFiles files={files} onChange={setFiles} />
        ) : null}

        {step === "select" ? (
          <WizardStepSelect
            entries={indexEntries}
            error={indexError}
            isLoading={indexLoading}
            onSelectionChange={(keys) => setSelectedKeys(new Set(keys))}
            selectedKeys={selectedKeys}
            total={indexTotal}
          />
        ) : null}

        {step === "fetch" ? (
          <WizardStepFetch
            busy={fetchBusy}
            error={fetchError}
            items={fetchedItems}
            onRetry={() => void startCreation()}
            readyItemIds={readyItemIds}
            remainingCount={remainingCount}
            sourceCount={createdSourceIds.length}
          />
        ) : null}

        {step === "plan" ? (
          <WizardStepPlan
            analyzable={readyItemIds.size > 0}
            kbId={kbId}
            onChange={setPlan}
            primarySourceId={primarySourceId}
            value={plan}
          />
        ) : null}
      </div>

      <WizardFooter
        backDisabled={fetchBusy || finishing}
        nextDisabled={nextDisabled}
        nextLabel={nextLabel}
        onBack={step === "type" ? undefined : handleBack}
        onNext={handleNext}
        pending={fetchBusy || finishing || indexLoading}
      />
    </div>
  );
}

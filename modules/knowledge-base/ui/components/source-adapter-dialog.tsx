import { useTranslation } from "@engenty/i18n/ui";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";

import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { KbSource } from "../../src/schema/types.js";
import type { KbSourceAdapterDescriptor } from "../api.js";
import { previewKbSourceIndex, runKbSourceNow } from "../api.js";
import type { SourceAdapterDialogInput } from "./source-adapter-editor.js";
import { SourceAdapterEditor } from "./source-adapter-editor.js";
import { SourceIndexBrowser } from "./source-index-browser.js";

interface SourceAdapterDialogProps {
  adapters: KbSourceAdapterDescriptor[];
  onOpenChange: (open: boolean) => void;
  /**
   * Called when the user confirms step 2 and retrieval has been started.
   * Receives the source ID so the parent can navigate to the detail page.
   */
  onStarted?: (sourceId: string) => void;
  /**
   * For create mode: may return the newly created source ID so the dialog
   * can transition to the index-browser step. For edit mode: return void.
   */
  onSubmit: (
    input: SourceAdapterDialogInput
  ) => Promise<string | undefined> | string | undefined;
  open: boolean;
  presetAdapterId?: string | null;
  saving?: boolean;
  source?: KbSource | null;
}

type SourceIndexPreview = Awaited<ReturnType<typeof previewKbSourceIndex>>;

function adapterNeedsIndexReview(
  adapters: KbSourceAdapterDescriptor[],
  id: string | null | undefined
): boolean {
  return adapters.find((item) => item.id === id)?.index_mode === "review";
}

export function SourceAdapterDialog({
  adapters,
  onOpenChange,
  onStarted,
  onSubmit,
  open,
  presetAdapterId,
  saving,
  source,
}: SourceAdapterDialogProps) {
  const { t } = useTranslation("kb");

  const [draftInput, setDraftInput] = useState<SourceAdapterDialogInput | null>(
    null
  );
  const [indexEntries, setIndexEntries] = useState<
    SourceIndexPreview["entries"]
  >([]);
  const [indexTotal, setIndexTotal] = useState(0);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState<Error | null>(null);
  const isStep2 = !!draftInput;
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);

  // Reset all step state when the dialog is closed
  useEffect(() => {
    if (!open) {
      setDraftInput(null);
      setIndexEntries([]);
      setIndexTotal(0);
      setIndexError(null);
      setSelectedKeys(new Set());
      setStarting(false);
    }
  }, [open]);

  // Auto-select all entries when index loads
  useEffect(() => {
    if (indexEntries.length > 0) {
      setSelectedKeys(new Set(indexEntries.map((e) => e.item_key)));
    }
  }, [indexEntries]);

  const createAndStartSingleSource = async (
    input: SourceAdapterDialogInput
  ) => {
    try {
      const result = await onSubmit(input);
      const sourceId =
        typeof result === "string" && result.length > 0 ? result : null;

      if (sourceId && !source) {
        await runKbSourceNow(sourceId, {
          background: true,
          trigger: "manual",
        });
        onStarted?.(sourceId);
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("sources.save_failed")
      );
    }
  };

  const handleEditorSubmit = async (input: SourceAdapterDialogInput) => {
    if (source || !adapterNeedsIndexReview(adapters, input.adapter_id)) {
      await createAndStartSingleSource(input);
      return;
    }

    setIndexLoading(true);
    setIndexError(null);
    try {
      const index = await previewKbSourceIndex({
        adapter_id: input.adapter_id,
        name: input.name,
        settings: input.settings,
      });
      setDraftInput(input);
      setIndexEntries(index.entries);
      setIndexTotal(index.total);
      setSelectedKeys(new Set(index.entries.map((entry) => entry.item_key)));
    } catch (error) {
      setIndexError(
        error instanceof Error
          ? error
          : new Error(t("sources.index_load_error"))
      );
    } finally {
      setIndexLoading(false);
    }
  };

  const handleStart = async () => {
    if (!draftInput) {
      return;
    }
    setStarting(true);
    try {
      const ignoredItemKeys = indexEntries
        .filter((entry) => !selectedKeys.has(entry.item_key))
        .map((entry) => entry.item_key);
      const result = await onSubmit({
        ...draftInput,
        ignored_item_keys: ignoredItemKeys,
        initial_index_entries: indexEntries,
      });
      const createdSourceId =
        typeof result === "string" && result.length > 0 ? result : null;
      if (!createdSourceId) {
        throw new Error(t("sources.save_failed"));
      }
      await runKbSourceNow(createdSourceId, {
        background: true,
        selected_item_keys: [...selectedKeys],
        trigger: "manual",
      });
      onStarted?.(createdSourceId);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("sources.save_failed"));
    } finally {
      setStarting(false);
    }
  };

  const handleBackToSettings = () => {
    setDraftInput(null);
    setIndexError(null);
    setStarting(false);
  };

  const adapterForTitle = source
    ? adapters.find((a) => a.id === source.adapter_id)
    : presetAdapterId
      ? adapters.find((a) => a.id === presetAdapterId)
      : adapters[0];

  const step1Title = source
    ? t("sources.edit_source")
    : adapterForTitle
      ? t("sources.add_adapter_title", { label: adapterForTitle.label })
      : t("sources.add_source");

  const showStepBadge =
    !source &&
    adapterNeedsIndexReview(adapters, presetAdapterId ?? adapterForTitle?.id);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-3xl overflow-x-hidden sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>
              {isStep2 ? t("sources.dialog_step2_title") : step1Title}
            </DialogTitle>
            {showStepBadge && (
              <Badge className="shrink-0" variant="secondary">
                {isStep2
                  ? t("sources.dialog_step_2_of_2")
                  : t("sources.dialog_step_1_of_2")}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {isStep2 ? (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              {t("sources.dialog_step2_desc")}
            </p>

            {indexError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-sm">
                {indexError instanceof Error
                  ? indexError.message
                  : t("sources.index_load_error")}
              </p>
            ) : (
              <SourceIndexBrowser
                entries={indexEntries}
                isLoading={indexLoading}
                onSelectionChange={(keys) => setSelectedKeys(new Set(keys))}
                selectedKeys={selectedKeys}
                total={indexTotal}
              />
            )}

            <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                disabled={starting}
                onClick={handleBackToSettings}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("sources.setup_wizard_back")}
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  onClick={() => onOpenChange(false)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("actions.cancel")}
                </Button>
                <Button
                  disabled={starting || indexLoading || !!indexError}
                  onClick={() => void handleStart()}
                  size="sm"
                  type="button"
                >
                  {starting && (
                    <AnimatedLoaderIcon
                      className="mr-1.5"
                      play="always"
                      size="xs"
                    />
                  )}
                  {selectedKeys.size > 0
                    ? t("sources.dialog_step2_start", {
                        count: selectedKeys.size,
                      })
                    : t("sources.dialog_step2_start_all")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <SourceAdapterEditor
            active={open}
            adapters={adapters}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleEditorSubmit}
            presetAdapterId={presetAdapterId}
            saving={saving || indexLoading}
            source={source}
            submitLabel={showStepBadge ? t("sources.create_index") : undefined}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Embedding model picker with gateway-backed catalog, model-change confirmation,
 * and full re-embedding progress after the model is saved. Drives the unified
 * `/api/search-index/providers/kb.article/{status,backfill}` admin surface.
 */

import { supportedEmbeddingModels } from "@engenty/ai-core/browser";
import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingsFormRow,
} from "@engenty/ui-core";

import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { useCallback, useMemo, useState } from "react";

const BATCH = 100;
const KB_PROVIDER_ID = "kb.article";

export interface KbSearchIndexStatus {
  current_count: number;
  indexed_count: number;
  last_indexed_at: string | null;
  missing_count: number;
  stale_count: number;
  total_count: number;
}

interface KbBackfillResponse {
  id: string;
  result: {
    failed: number;
    processed: number;
    results: { article_id: string; error?: string; ok: boolean }[];
  };
}

export async function fetchKbSearchIndexStatus(): Promise<KbSearchIndexStatus> {
  const res = await requestApiJson<any>(
    `/api/search-index/providers/${KB_PROVIDER_ID}/status`,
    { method: "GET" }
  );
  return res?.status ?? res?.data?.status;
}

async function runKbSearchIndexBackfill(
  limit: number,
  force: boolean
): Promise<KbBackfillResponse["result"]> {
  const res = await requestApiJson<any>(
    `/api/search-index/providers/${KB_PROVIDER_ID}/backfill`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force, limit }),
    }
  );
  return res?.result ?? res?.data?.result;
}

export interface KbSettingsEmbeddingModelFieldProps {
  embeddingDraft: string;
  onCommitEmbeddingModel: (nextModel: string) => Promise<void>;
  onReindexComplete: () => void;
  savedEmbeddingModel: string;
  setEmbeddingDraft: (value: string) => void;
}

export function KbSettingsEmbeddingModelField({
  embeddingDraft,
  savedEmbeddingModel,
  setEmbeddingDraft,
  onCommitEmbeddingModel,
  onReindexComplete,
}: KbSettingsEmbeddingModelFieldProps) {
  const { t } = useTranslation("kb");
  const catalogIds = useMemo(
    () => new Set(supportedEmbeddingModels.models.map((m) => m.id)),
    []
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingModel, setPendingModel] = useState<string | null>(null);

  const [progressOpen, setProgressOpen] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [progressValue, setProgressValue] = useState(0);
  const [progressWorking, setProgressWorking] = useState(false);

  const modelOptions = useMemo(
    () =>
      supportedEmbeddingModels.models.map((m) => ({
        value: m.id,
        label: m.name ? `${m.name} (${m.id})` : m.id,
      })),
    []
  );

  const runFullReindex = useCallback(async () => {
    setProgressOpen(true);
    setProgressWorking(true);
    setProgressValue(0);
    setProgressLabel(t("settings.embedding_reindex_preparing"));

    try {
      const initial = await fetchKbSearchIndexStatus();
      const total = initial.total_count;
      // Force re-embed every article so the new model is applied uniformly.
      let done = 0;
      while (true) {
        setProgressLabel(t("settings.embedding_reindex_batch"));
        const result = await runKbSearchIndexBackfill(BATCH, true);
        done += result.processed;
        if (total > 0) {
          setProgressValue(Math.min(100, Math.round((done / total) * 100)));
        }
        const failedRow = result.results.find((r) => !r.ok);
        if (failedRow) {
          throw new Error(
            `${failedRow.error ?? "embed_failed"} (${failedRow.article_id})`
          );
        }
        if (result.processed === 0 || result.processed < BATCH) {
          break;
        }
      }
      setProgressValue(100);
      setProgressLabel(t("settings.embedding_reindex_done"));
      onReindexComplete();
    } catch (e) {
      setProgressLabel(
        e instanceof Error ? e.message : t("settings.embedding_reindex_failed")
      );
    } finally {
      setProgressWorking(false);
    }
  }, [onReindexComplete, t]);

  const handleSelectChange = (next: string) => {
    if (next === savedEmbeddingModel) {
      setEmbeddingDraft(next);
      return;
    }
    setPendingModel(next);
    setConfirmOpen(true);
    setEmbeddingDraft(next);
  };

  const handleCancelConfirm = () => {
    setEmbeddingDraft(savedEmbeddingModel);
    setPendingModel(null);
    setConfirmOpen(false);
  };

  const handleConfirmModelChange = async () => {
    const next = pendingModel;
    if (!next) {
      setConfirmOpen(false);
      return;
    }
    setPendingModel(null);
    setConfirmOpen(false);
    await onCommitEmbeddingModel(next);
    await runFullReindex();
  };

  const catalogHasSaved =
    !savedEmbeddingModel || catalogIds.has(savedEmbeddingModel);

  return (
    <div className="min-w-0">
      <SettingsFormRow
        className="sm:items-end"
        controlSizing="wide"
        hint={t("settings.embedding_model_hint")}
        label={t("settings.embedding_model")}
        labelFor="kb-settings-embedding-model"
      >
        <Select onValueChange={handleSelectChange} value={embeddingDraft}>
          <SelectTrigger
            className="w-full min-w-0 truncate"
            id="kb-settings-embedding-model"
          >
            <SelectValue>
              {(value: string | null) => {
                if (!value) {
                  return t("settings.embedding_model");
                }
                const opt = modelOptions.find((o) => o.value === value);
                return opt ? opt.label : value;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className="min-w-fit">
            {!catalogHasSaved && savedEmbeddingModel ? (
              <SelectItem value={savedEmbeddingModel}>
                {savedEmbeddingModel} {t("settings.embedding_model_custom")}
              </SelectItem>
            ) : null}
            {modelOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsFormRow>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && pendingModel !== null) {
            setEmbeddingDraft(savedEmbeddingModel);
            setPendingModel(null);
          }
          setConfirmOpen(open);
        }}
        open={confirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.embedding_change_title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                {t("settings.embedding_change_body")}
              </span>
              {pendingModel ? (
                <span className="block font-medium text-foreground">
                  {t("settings.embedding_change_to")} {pendingModel}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelConfirm}>
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                void handleConfirmModelChange();
              }}
            >
              {t("settings.embedding_change_confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        onOpenChange={(open) => {
          if (!(open || progressWorking)) {
            setProgressOpen(false);
          }
        }}
        open={progressOpen}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!progressWorking}
        >
          <DialogHeader>
            <DialogTitle>{t("settings.embedding_reindex_title")}</DialogTitle>
            <DialogDescription>
              {t("settings.embedding_reindex_description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Progress value={progressValue} />
            <p className="flex min-h-[1.25rem] items-center gap-2 text-muted-foreground text-sm">
              {progressWorking ? (
                <AnimatedLoaderIcon
                  className="shrink-0"
                  play="always"
                  size="sm"
                />
              ) : null}
              {progressLabel}
            </p>
          </div>
          <DialogFooter>
            <Button
              disabled={progressWorking}
              onClick={() => setProgressOpen(false)}
              type="button"
              variant="secondary"
            >
              {t("actions.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Create `manual` and `file_upload` KB sources from the Sources list (not adapter-picker flows).
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@engenty/ui-core";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createKbSource, uploadKbVaultFile } from "../api.js";

export function KbManualSourceDialog({
  kbId,
  onOpenChange,
  open,
  saving,
  onSubmittingChange,
  onSuccess,
}: {
  kbId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  saving: boolean;
  onSubmittingChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation("kb");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const reset = () => {
    setTitle("");
    setBody("");
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  };

  const onSave = async () => {
    const name = title.trim();
    if (!name) {
      return;
    }
    onSubmittingChange(true);
    try {
      await createKbSource({
        adapter_id: "manual",
        enabled: false,
        kb_id: kbId,
        missing_item_strategy: "ignore",
        name,
        schedule: {
          cron_expression: null,
          enabled: false,
          interval_minutes: null,
          kind: "interval",
          timezone: "UTC",
        },
        settings: { body_markdown: body, title: name },
        status: "active",
      });
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("sources.save_failed")
      );
    } finally {
      onSubmittingChange(false);
    }
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sources.manual_dialog_title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-2">
            <Label htmlFor="kb-manual-title">
              {t("sources.manual_title_label")}
            </Label>
            <Input
              autoFocus
              id="kb-manual-title"
              onChange={(e) => setTitle(e.target.value)}
              value={title}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kb-manual-body">
              {t("sources.manual_body_label")}
            </Label>
            <Textarea
              className="min-h-[10rem] font-mono text-sm"
              id="kb-manual-body"
              onChange={(e) => setBody(e.target.value)}
              value={body}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={saving}
            onClick={() => handleClose(false)}
            type="button"
            variant="outline"
          >
            {t("inbox.cancel")}
          </Button>
          <Button
            disabled={saving || !title.trim()}
            onClick={() => void onSave()}
            type="button"
          >
            {t("sources.manual_save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FileEntry {
  error?: string;
  file: File;
  id: string;
  status: "pending" | "uploading" | "done" | "error";
}

export function KbFileUploadSourceDialog({
  kbId,
  onOpenChange,
  open,
  saving,
  onSubmittingChange,
  onSuccess,
  initialFiles,
}: {
  kbId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  saving: boolean;
  onSubmittingChange: (v: boolean) => void;
  onSuccess: () => void;
  initialFiles?: File[];
}) {
  const { t } = useTranslation("kb");
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [busy, setBusy] = useState(false);

  // Populate from initialFiles when dialog opens
  useEffect(() => {
    if (open && initialFiles && initialFiles.length > 0) {
      setEntries(
        initialFiles.map((file) => ({
          id: `${file.name}-${file.size}`,
          file,
          status: "pending",
        }))
      );
    }
  }, [open, initialFiles]);

  const addFiles = (files: File[]) => {
    setEntries((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      const next = files
        .map((file) => ({
          id: `${file.name}-${file.size}`,
          file,
          status: "pending" as const,
        }))
        .filter((e) => !existingIds.has(e.id));
      return [...prev, ...next];
    });
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleClose = (next: boolean) => {
    if (!(next || busy)) {
      setEntries([]);
    }
    onOpenChange(next);
  };

  const handleUploadAll = async () => {
    const pending = entries.filter((e) => e.status === "pending");
    if (!pending.length) {
      return;
    }
    setBusy(true);
    onSubmittingChange(true);
    let anySuccess = false;
    for (const entry of pending) {
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: "uploading" } : e))
      );
      try {
        const uploaded = await uploadKbVaultFile(entry.file, { kbId });
        const name =
          uploaded.filename.replace(/\.[^/.]+$/, "") || uploaded.filename;
        await createKbSource({
          adapter_id: "file_upload",
          enabled: false,
          kb_id: kbId,
          missing_item_strategy: "ignore",
          name,
          schedule: {
            cron_expression: null,
            enabled: false,
            interval_minutes: null,
            kind: "interval",
            timezone: "UTC",
          },
          settings: {
            original_filename: uploaded.filename,
            storage_object_key: uploaded.key,
          },
          status: "active",
        });
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, status: "done" } : e))
        );
        anySuccess = true;
      } catch (error) {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id
              ? {
                  ...e,
                  status: "error",
                  error:
                    error instanceof Error
                      ? error.message
                      : t("sources.save_failed"),
                }
              : e
          )
        );
      }
    }
    setBusy(false);
    onSubmittingChange(false);
    if (anySuccess) {
      onSuccess();
    }
    // Close only if all succeeded
    if (
      entries.every(
        (e) =>
          e.status === "done" ||
          (e.status !== "error" && e.status !== "pending")
      )
    ) {
      setEntries([]);
      onOpenChange(false);
    }
  };

  const pendingCount = entries.filter((e) => e.status === "pending").length;
  const allDone =
    entries.length > 0 && entries.every((e) => e.status === "done");

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sources.file_upload_dialog_title")}</DialogTitle>
        </DialogHeader>
        <input
          accept="*/*"
          className="hidden"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) {
              addFiles(files);
            }
          }}
          ref={inputRef}
          type="file"
        />
        <div className="flex flex-col gap-3 py-1">
          {entries.length > 0 ? (
            <div className="flex flex-col gap-1.5 rounded-lg border p-2">
              {entries.map((entry) => (
                <div
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                  key={entry.id}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {entry.file.name}
                  </span>
                  {entry.status === "uploading" && (
                    <span className="text-muted-foreground text-xs">
                      Uploading…
                    </span>
                  )}
                  {entry.status === "done" && (
                    <span className="text-green-600 text-xs">✓</span>
                  )}
                  {entry.status === "error" && (
                    <span
                      className="text-destructive text-xs"
                      title={entry.error}
                    >
                      ✗
                    </span>
                  )}
                  {entry.status === "pending" && !busy && (
                    <button
                      className="ml-1 text-muted-foreground text-xs hover:text-foreground"
                      onClick={() => removeEntry(entry.id)}
                      type="button"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          <Button
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            type="button"
            variant="secondary"
          >
            {entries.length > 0
              ? t("sources.file_upload_choose_more")
              : t("sources.file_upload_choose")}
          </Button>
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={() => handleClose(false)}
            type="button"
            variant="outline"
          >
            {t("inbox.cancel")}
          </Button>
          {!allDone && (
            <Button
              disabled={busy || saving || pendingCount === 0}
              onClick={() => void handleUploadAll()}
              type="button"
            >
              {busy
                ? t("sources.file_upload_uploading")
                : pendingCount > 1
                  ? t("sources.file_upload_upload_all", { count: pendingCount })
                  : t("sources.file_upload_choose")}
            </Button>
          )}
          {allDone && (
            <Button onClick={() => handleClose(false)} type="button">
              {t("sources.file_upload_done")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

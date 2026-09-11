/**
 * Step 2 for the "files" kind — the dropzone.
 *
 * A `file_upload` source holds exactly one document, so dropping several files
 * creates several sources. They still share one plan: the rest of the wizard
 * applies the same ingest configuration to every source it created.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { FileUp, X } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { KB_FILE_UPLOAD_MAX_BYTES } from "../../api.js";
import { WizardStepHeader } from "./wizard-chrome.js";

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WizardStepFiles({
  files,
  onChange,
}: {
  files: File[];
  onChange: (next: File[]) => void;
}) {
  const { t } = useTranslation("kb");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  const addFiles = (incoming: File[]) => {
    const tooLarge = incoming.filter(
      (file) => file.size > KB_FILE_UPLOAD_MAX_BYTES
    );
    setRejected(tooLarge.map((file) => file.name));
    const known = new Set(files.map((file) => `${file.name}-${file.size}`));
    const accepted = incoming.filter(
      (file) =>
        file.size <= KB_FILE_UPLOAD_MAX_BYTES &&
        !known.has(`${file.name}-${file.size}`)
    );
    if (accepted.length > 0) {
      onChange([...files, ...accepted]);
    }
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles([...event.dataTransfer.files]);
  };

  return (
    <div className="flex flex-col gap-4">
      <WizardStepHeader
        description={t("sources.wizard_files_desc")}
        title={t("sources.wizard_files_title")}
      />

      <button
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/20 hover:border-muted-foreground/40"
        )}
        onClick={() => inputRef.current?.click()}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={onDrop}
        type="button"
      >
        <FileUp aria-hidden className="h-7 w-7 text-muted-foreground" />
        <span className="font-medium text-sm">
          {t("sources.wizard_files_dropzone")}
        </span>
        <span className="text-muted-foreground text-xs">
          {t("sources.wizard_files_dropzone_hint", {
            size: formatBytes(KB_FILE_UPLOAD_MAX_BYTES),
          })}
        </span>
      </button>

      <input
        className="hidden"
        multiple
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          event.target.value = "";
          addFiles(picked);
        }}
        ref={inputRef}
        type="file"
      />

      {rejected.length > 0 ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs">
          {t("sources.wizard_files_too_large", {
            names: rejected.join(", "),
            size: formatBytes(KB_FILE_UPLOAD_MAX_BYTES),
          })}
        </p>
      ) : null}

      {files.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {files.map((file) => (
            <li
              className="flex items-center gap-3 px-3 py-2 text-sm"
              key={`${file.name}-${file.size}`}
            >
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {formatBytes(file.size)}
              </span>
              <Button
                aria-label={t("sources.wizard_files_remove")}
                className="h-6 w-6 shrink-0 p-0"
                onClick={() =>
                  onChange(
                    files.filter(
                      (candidate) =>
                        !(
                          candidate.name === file.name &&
                          candidate.size === file.size
                        )
                    )
                  )
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

"use client";

import { Button, cn, Spinner } from "@engenty/ui-core";
import {
  Download,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { useCallback, useState } from "react";
import { getFileStorageSignedUrl } from "../../../lib/file-storage-signed-url.js";
import {
  type FileDownloadOfferItem,
  resolveFileDownloadOfferFiles,
} from "./file-download-offer.js";
import type { ToolCallCardProps } from "./tool-call-card.types";

type DownloadStatus = "idle" | "loading" | "error";

function pickFileIcon(mimeType: string | undefined, filename: string) {
  const mime = mimeType?.trim().toLowerCase() ?? "";
  if (mime.startsWith("image/")) {
    return FileImage;
  }
  if (
    mime === "application/pdf" ||
    mime.includes("wordprocessing") ||
    mime.startsWith("text/")
  ) {
    return FileText;
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv"
  ) {
    return FileSpreadsheet;
  }
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    filename.endsWith(".zip")
  ) {
    return FileArchive;
  }
  return File;
}

function FileDownloadOfferRow({ file }: { file: FileDownloadOfferItem }) {
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const Icon = pickFileIcon(file.mime_type, file.name);

  const handleDownload = useCallback(async () => {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const url = await getFileStorageSignedUrl(file.key);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Download failed"
      );
    }
  }, [file.key, file.name]);

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{file.name}</p>
        {errorMessage ? (
          <p className="mt-0.5 text-destructive text-xs">{errorMessage}</p>
        ) : null}
      </div>
      <Button
        aria-label={`Download ${file.name}`}
        disabled={status === "loading"}
        onClick={() => {
          void handleDownload();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {status === "loading" ? (
          <Spinner className="size-3.5" />
        ) : (
          <Download className="size-3.5" />
        )}
        Download
      </Button>
    </li>
  );
}

export function FileDownloadsToolCallCard(props: ToolCallCardProps) {
  const files = resolveFileDownloadOfferFiles(props.input, props.output);
  if (files.length === 0) {
    return null;
  }

  const headline =
    props.displayLabel ??
    (files.length === 1 ? "Download file" : `Download ${files.length} files`);
  const isPending = props.state === "pending" || props.state === "running";

  return (
    <div
      className={cn(
        "my-1 w-full overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-border/60",
        props.className
      )}
    >
      <div className="border-border/60 border-b px-3 py-2">
        <p className="font-medium text-sm">{headline}</p>
        {isPending ? (
          <p className="mt-0.5 text-muted-foreground text-xs">
            Preparing downloads…
          </p>
        ) : null}
      </div>
      <ul className="divide-y divide-border/60">
        {files.map((file) => (
          <FileDownloadOfferRow file={file} key={file.key} />
        ))}
      </ul>
    </div>
  );
}

export {
  isFileDownloadsOfferOutput,
  matchesFileDownloadsToolCall,
} from "./file-download-offer.js";

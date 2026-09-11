"use client";

import { useQuery } from "@engenty/query-client";
import { cn, Spinner } from "@engenty/ui-core";
import { MessageResponse } from "../components/presentation.js";
import { extractedMarkdownSidecarKey } from "../lib/extracted-markdown-sidecar.js";
import { getFileStorageSignedUrl } from "../lib/file-storage-signed-url.js";

const EXTRACT_PREVIEW_MAX_CHARS = 80_000;

export function WorkFileExtractedPreview({
  className,
  labels,
  refreshing = false,
  storageKey,
}: {
  className?: string;
  labels: {
    extractedTextLoading: string;
    noExtractedText: string;
    truncated: string;
  };
  refreshing?: boolean;
  storageKey: string;
}) {
  const sidecarKey = extractedMarkdownSidecarKey(storageKey);
  const query = useQuery({
    enabled: Boolean(sidecarKey),
    queryFn: async ({ signal }) => {
      const url = await getFileStorageSignedUrl(sidecarKey);
      const response = await fetch(url, { cache: "no-store", signal });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        return null;
      }
      const text = (await response.text()).trim();
      if (!text) {
        return null;
      }
      const truncated = text.length > EXTRACT_PREVIEW_MAX_CHARS;
      return {
        text: truncated ? text.slice(0, EXTRACT_PREVIEW_MAX_CHARS) : text,
        truncated,
      };
    },
    queryKey: ["work-files", "extracted-markdown", sidecarKey],
    retry: false,
    staleTime: 60_000,
  });

  if (query.isPending || refreshing) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center gap-2",
          className
        )}
      >
        <Spinner />
        <p className="text-muted-foreground text-sm">
          {labels.extractedTextLoading}
        </p>
      </div>
    );
  }

  if (!query.data) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center p-6",
          className
        )}
      >
        <p className="text-center text-muted-foreground text-sm">
          {labels.noExtractedText}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <MessageResponse className="prose prose-sm dark:prose-invert max-w-none">
          {query.data.text}
        </MessageResponse>
      </div>
      {query.data.truncated ? (
        <p className="shrink-0 border-border-soft border-t px-4 py-1.5 text-muted-foreground text-xs">
          {labels.truncated}
        </p>
      ) : null}
    </div>
  );
}

// Files tab for WorkPanel: card grid; open preview in the workspace split pane.
import { useTranslation } from "@engenty/i18n/ui";
import { adminListCardsGridClassName, cn, Spinner } from "@engenty/ui-core";
import { FileText } from "lucide-react";
import { openWorkFilePaneTab } from "./artifact-store.js";
import type { WorkContainerRef } from "./artifacts-api.js";
import { workFileIcon, workFileMime } from "./work-file-preview.js";
import { useWorkFilesQuery, type WorkFileEntry } from "./work-files-api.js";

const CARD_CN = "ui-card-raised cursor-pointer text-left";

function formatBytes(bytes: number | null): string | null {
  if (bytes == null) {
    return null;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

function WorkFileCard({
  entry,
  onOpen,
}: {
  entry: WorkFileEntry;
  onOpen: () => void;
}) {
  const mime = workFileMime(entry.filename);
  const Icon = workFileIcon(mime);
  const size = formatBytes(entry.size_bytes);
  return (
    <button
      className={cn(CARD_CN, "flex flex-col gap-3 p-4")}
      onClick={onOpen}
      type="button"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <Icon className="size-5 shrink-0 text-muted-foreground" />
        {size ? (
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {size}
          </span>
        ) : null}
      </div>
      <span
        className="line-clamp-2 w-full break-all font-mono text-sm"
        title={entry.filename}
      >
        {entry.filename}
      </span>
    </button>
  );
}

export function WorkFilesTab({
  container,
  hostKey,
}: {
  container: WorkContainerRef;
  /** Same host as WorkPanel / WorkspaceArtifactPane — opens the end-pane split. */
  hostKey: string;
}) {
  const { t } = useTranslation("ai-ui");
  const filesQuery = useWorkFilesQuery(container);
  const files = filesQuery.data?.entries ?? [];

  if (filesQuery.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <FileText className="h-6 w-6 text-muted-foreground/50" />
        <p className="max-w-sm text-muted-foreground text-sm">
          {t("workPanel.filesEmpty")}
        </p>
      </div>
    );
  }

  return (
    <div className={adminListCardsGridClassName("compact")}>
      {files.map((entry) => (
        <WorkFileCard
          entry={entry}
          key={entry.key}
          onOpen={() =>
            openWorkFilePaneTab(hostKey, {
              entryKey: entry.key,
              filename: entry.filename,
            })
          }
        />
      ))}
    </div>
  );
}

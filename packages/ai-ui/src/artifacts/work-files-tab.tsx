// Files tab for WorkPanel: card grid + detail sheet (preview + download).
import { useTranslation } from "@engenty/i18n/ui";
import {
  adminListCardsGridClassName,
  Badge,
  Button,
  cn,
  SidePanel,
  SidePanelContent,
  SidePanelDescription,
  SidePanelHeader,
  SidePanelTitle,
  Spinner,
} from "@engenty/ui-core";
import { Download, FileText } from "lucide-react";
import { useState } from "react";
import type { WorkContainerRef } from "./artifacts-api.js";
import {
  downloadWorkFile,
  WorkFilePreview,
  workFileIcon,
  workFileMime,
} from "./work-file-preview.js";
import { useWorkFilesQuery, type WorkFileEntry } from "./work-files-api.js";

const CARD_CN =
  "ui-canvas-raised cursor-pointer rounded-md bg-card text-left transition-shadow hover:shadow-[var(--e-3)]";

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

export function WorkFilesTab({ container }: { container: WorkContainerRef }) {
  const { t } = useTranslation("ai-ui");
  const filesQuery = useWorkFilesQuery(container);
  const files = filesQuery.data?.entries ?? [];
  const [selected, setSelected] = useState<WorkFileEntry | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!selected || downloading) {
      return;
    }
    setDownloading(true);
    try {
      await downloadWorkFile(selected.key, selected.filename);
    } finally {
      setDownloading(false);
    }
  };

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

  const selectedMime = selected ? workFileMime(selected.filename) : null;
  const selectedSize = selected ? formatBytes(selected.size_bytes) : null;

  return (
    <>
      <div className={adminListCardsGridClassName("compact")}>
        {files.map((entry) => (
          <WorkFileCard
            entry={entry}
            key={entry.key}
            onOpen={() => setSelected(entry)}
          />
        ))}
      </div>

      <SidePanel
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        open={Boolean(selected)}
      >
        <SidePanelContent className="flex w-full flex-col gap-0 sm:max-w-lg lg:max-w-xl">
          {selected ? (
            <>
              <SidePanelHeader className="border-b px-1 pb-3">
                <div className="flex items-start justify-between gap-3 pr-8">
                  <div className="min-w-0 space-y-1.5">
                    <SidePanelTitle
                      className="truncate font-mono text-base"
                      title={selected.filename}
                    >
                      {selected.filename}
                    </SidePanelTitle>
                    <SidePanelDescription className="flex flex-wrap items-center gap-2">
                      {selectedMime ? (
                        <Badge variant="secondary">{selectedMime}</Badge>
                      ) : null}
                      {selectedSize ? (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {selectedSize}
                        </span>
                      ) : null}
                    </SidePanelDescription>
                  </div>
                  <Button
                    className="shrink-0 gap-1.5"
                    disabled={downloading}
                    onClick={() => void handleDownload()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Download className="size-3.5" />
                    {t("workPanel.downloadFile")}
                  </Button>
                </div>
              </SidePanelHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
                <WorkFilePreview
                  entryKey={selected.key}
                  filename={selected.filename}
                  labels={{
                    loading: t("workPanel.filePreviewLoading"),
                    noPreview: t("workPanel.fileNoPreview"),
                    truncated: t("workPanel.filePreviewTruncated"),
                  }}
                />
              </div>
            </>
          ) : null}
        </SidePanelContent>
      </SidePanel>
    </>
  );
}

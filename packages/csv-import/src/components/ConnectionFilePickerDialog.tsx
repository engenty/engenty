import { useQuery } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@engenty/ui-core";
import { ChevronRight, FileSpreadsheet, Folder } from "lucide-react";
import { useState } from "react";
import { browseConnectionFileSource } from "../connection-import-api.js";
import { isImportableConnectionFile } from "../import-sources.js";

interface PickerCrumb {
  name: string;
  ref: string | null;
}

export interface ConnectionFilePickerDialogProps {
  browseEmptyLabel: string;
  cancelLabel: string;
  connectionId: string;
  connectionLabel: string;
  description: string;
  loadingLabel?: string;
  onOpenChange: (open: boolean) => void;
  onPick: (file: { name: string; ref: string }) => void;
  open: boolean;
  title: string;
}

/** Browse a file-capable connection and pick a CSV / Sheet for import. */
export function ConnectionFilePickerDialog({
  browseEmptyLabel,
  cancelLabel,
  connectionId,
  connectionLabel,
  description,
  onOpenChange,
  onPick,
  open,
  title,
}: ConnectionFilePickerDialogProps) {
  const [path, setPath] = useState<PickerCrumb[]>([]);
  const currentRef = path.at(-1)?.ref ?? null;

  const browseQuery = useQuery({
    enabled: open && Boolean(connectionId),
    queryKey: ["import", "connection-browse", connectionId, currentRef ?? ""],
    queryFn: ({ signal }) =>
      browseConnectionFileSource(
        connectionId,
        { folderRef: currentRef },
        signal
      ),
    staleTime: 10_000,
  });

  const entries = browseQuery.data?.entries ?? [];
  const folders = entries.filter((e) => e.kind === "folder");
  const files = entries.filter((e) => isImportableConnectionFile(e));

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setPath([]);
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <nav className="flex flex-wrap items-center gap-1 text-sm">
          <button
            className={
              path.length === 0
                ? "font-medium"
                : "text-muted-foreground hover:text-foreground"
            }
            disabled={path.length === 0}
            onClick={() => setPath([])}
            type="button"
          >
            {connectionLabel}
          </button>
          {path.map((crumb, index) => (
            <span className="flex items-center gap-1" key={crumb.ref ?? index}>
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <button
                className={
                  index === path.length - 1
                    ? "font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }
                disabled={index === path.length - 1}
                onClick={() => setPath((prev) => prev.slice(0, index + 1))}
                type="button"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="max-h-72 min-h-40 overflow-y-auto rounded-md border">
          {browseQuery.isLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton className="h-8" key={`import-browse-${i}`} />
              ))}
            </div>
          ) : browseQuery.error ? (
            <div className="p-3 text-destructive text-sm">
              {browseQuery.error instanceof Error
                ? browseQuery.error.message
                : "Failed to browse"}
            </div>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="p-3 text-muted-foreground text-sm">
              {browseEmptyLabel}
            </div>
          ) : (
            <ul>
              {folders.map((folder) => (
                <li key={folder.ref}>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/40"
                    onClick={() =>
                      setPath((prev) => [
                        ...prev,
                        { name: folder.name, ref: folder.ref },
                      ])
                    }
                    type="button"
                  >
                    <Folder className="size-4 shrink-0 text-primary/70" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                </li>
              ))}
              {files.map((file) => (
                <li key={file.ref}>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/40"
                    onClick={() => onPick({ name: file.name, ref: file.ref })}
                    type="button"
                  >
                    <FileSpreadsheet className="size-4 shrink-0 text-primary/70" />
                    <span className="truncate">{file.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {cancelLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

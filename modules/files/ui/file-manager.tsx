import { useLocalFilesBridge } from "@engenty/connections-local-files/ui/local-files-bridge";
import { fileSpaceInvalidationKey } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Skeleton,
} from "@engenty/ui-core";
import {
  Cable,
  ChevronRight,
  Download,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Pencil,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FileSpaceActions,
  useFileSpaceActions,
} from "./components/file-space-actions.js";
import {
  deleteFolder,
  deleteSpaceFile,
  type FileSpaceFile,
  type FileSpaceFolder,
  type FileSpaceOwnerRef,
  getSpaceFileUrl,
  updateFile,
  updateFolder,
} from "./file-manager-api.js";
import { fileSpaceQueryOptions } from "./file-manager-queries.js";

export type {
  FileSpaceFile,
  FileSpaceFolder,
  FileSpaceListing,
  FileSpaceOwnerRef,
} from "./file-manager-api.js";

export interface FileManagerProps {
  className?: string;
  /**
   * Browse this folder instead of an internal path stack. `null` is the file
   * space root; omit the prop to keep the manager's own breadcrumb navigation
   * (the project Files tab).
   */
  folderId?: string | null;
  /** Hide the in-component breadcrumb when the host already names the folder. */
  hideBreadcrumb?: boolean;
  /** Called instead of descending internally — the Data tree owns the URL. */
  onOpenFile?: (file: FileSpaceFile) => void;
  onOpenFolder?: (folder: FileSpaceFolder) => void;
  /** The container this file space belongs to (e.g. { type: "project", id }). */
  owner: FileSpaceOwnerRef;
  /** When true, all mutating actions are hidden. */
  readOnly?: boolean;
}

interface Crumb {
  id: string | null;
  name: string;
}

/* ── Helpers ── */

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function fileIconFor(mime: string) {
  if (mime.startsWith("image/")) {
    return FileImage;
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv"
  ) {
    return FileSpreadsheet;
  }
  if (
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime.includes("word")
  ) {
    return FileText;
  }
  return FileIcon;
}

type RenameTarget =
  | { kind: "folder"; id: string; name: string }
  | { kind: "file"; id: string; name: string };

type DeleteTarget =
  | { kind: "folder"; id: string; name: string; isMount?: boolean }
  | { kind: "file"; id: string; name: string };

/* ── Component ── */

export function FileManager({
  className,
  folderId,
  hideBreadcrumb,
  onOpenFile,
  onOpenFolder,
  owner,
  readOnly,
}: FileManagerProps) {
  const { t } = useTranslation("files");
  const queryClient = useQueryClient();
  const { ready: localFilesReady } = useLocalFilesBridge();

  const [path, setPath] = useState<Crumb[]>([{ id: null, name: "" }]);
  const currentFolderId =
    folderId === undefined ? (path.at(-1)?.id ?? null) : folderId;

  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const { data, isLoading, error } = useQuery({
    ...fileSpaceQueryOptions(owner, { folderId: currentFolderId }),
    enabled: localFilesReady,
  });
  const listingPending = !localFilesReady || isLoading;

  // Inside a connector mount everything is a virtual read-only projection.
  const insideMount = data?.readOnly === true;
  const mutationsDisabled = Boolean(readOnly) || insideMount;
  const actions = useFileSpaceActions(
    owner,
    currentFolderId,
    mutationsDisabled
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: fileSpaceInvalidationKey(owner),
    });
  }, [owner, queryClient]);

  /* ── Navigation ── */
  const openFolder = useCallback(
    (folder: FileSpaceFolder) => {
      if (onOpenFolder) {
        onOpenFolder(folder);
        return;
      }
      setPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    },
    [onOpenFolder]
  );

  const navigateToCrumb = useCallback((index: number) => {
    setPath((prev) => prev.slice(0, index + 1));
  }, []);

  const renameMutation = useMutation({
    mutationFn: async (input: { target: RenameTarget; name: string }) => {
      if (input.target.kind === "folder") {
        await updateFolder(owner, input.target.id, { name: input.name });
      } else {
        await updateFile(owner, input.target.id, { name: input.name });
      }
    },
    onSuccess: () => {
      invalidate();
      setRenameTarget(null);
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error ? e.message : t("fileManager.errors.generic")
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: async (target: DeleteTarget) => {
      if (target.kind === "folder") {
        await deleteFolder(owner, target.id);
      } else {
        await deleteSpaceFile(owner, target.id);
      }
    },
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error ? e.message : t("fileManager.errors.generic")
      ),
  });

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (mutationsDisabled) {
        return;
      }
      if (e.dataTransfer?.files?.length) {
        void actions.uploadFiles(e.dataTransfer.files);
      }
    },
    [actions, mutationsDisabled]
  );

  const handleDownload = useCallback(
    async (file: FileSpaceFile) => {
      try {
        const url = await getSpaceFileUrl(owner, file.id);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.target = "_blank";
        a.click();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : t("fileManager.errors.generic")
        );
      }
    },
    [owner, t]
  );

  const folders = data?.folders ?? [];
  const files = data?.files ?? [];
  const isEmpty = folders.length === 0 && files.length === 0;

  const breadcrumb = useMemo(
    () =>
      path.map((crumb, index) => ({
        label: index === 0 ? t("fileManager.root") : crumb.name,
        index,
        isLast: index === path.length - 1,
      })),
    [path, t]
  );

  return (
    <div
      className={`flex min-h-[32rem] w-full flex-col gap-3 ${className ?? ""}`}
      onDragLeave={() => setDragActive(false)}
      onDragOver={(e) => {
        if (!mutationsDisabled) {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDrop={handleDrop}
    >
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {hideBreadcrumb ? (
          <div className="min-w-0 flex-1" />
        ) : (
          <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
            {breadcrumb.map((crumb) => (
              <span className="flex items-center gap-1" key={crumb.index}>
                {crumb.index > 0 && (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <button
                  className={`max-w-[12rem] truncate rounded px-1 py-0.5 ${
                    crumb.isLast
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  disabled={crumb.isLast}
                  onClick={() => navigateToCrumb(crumb.index)}
                  type="button"
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </nav>
        )}
        <FileSpaceActions
          actions={actions}
          currentFolderId={currentFolderId}
          owner={owner}
        />
      </div>

      {/* ── Body ── */}
      <div
        className={`relative flex-1 rounded-lg border ${
          dragActive
            ? "border-primary border-dashed bg-primary/5"
            : "border-border"
        }`}
      >
        {dragActive && !mutationsDisabled && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/80 text-sm">
            <UploadCloud className="size-8 text-primary" />
            {t("fileManager.dropHere")}
          </div>
        )}

        {listingPending ? (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton className="h-24" key={`sk-${i}`} />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-destructive text-sm">
            {error instanceof Error
              ? error.message
              : t("fileManager.errors.generic")}
          </div>
        ) : isEmpty ? (
          <Empty className="py-12">
            <EmptyMedia>
              <Folder className="size-14 text-muted-foreground/30" />
            </EmptyMedia>
            <EmptyContent>
              <EmptyHeader>
                <EmptyTitle>{t("fileManager.empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {readOnly
                    ? t("fileManager.empty.readOnly")
                    : t("fileManager.empty.description")}
                </EmptyDescription>
              </EmptyHeader>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {folders.map((folder) => (
              <div
                className="ui-card-raised ui-card-interactive group relative flex cursor-pointer flex-col items-center gap-2 p-3"
                key={folder.id}
                onDoubleClick={() => openFolder(folder)}
              >
                <button
                  className="flex w-full flex-col items-center gap-2"
                  onClick={() => openFolder(folder)}
                  type="button"
                >
                  <Folder className="size-10 text-primary/70" />
                  <span
                    className="w-full truncate text-center font-medium text-xs"
                    title={folder.name}
                  >
                    {folder.name}
                  </span>
                </button>
                {folder.connectionId && !folder.readOnly && (
                  <Badge className="gap-1 text-xxs" variant="outline">
                    <Cable className="size-2.5" />
                    {t("fileManager.sources.connectedBadge")}
                  </Badge>
                )}
                {!(readOnly || folder.readOnly) && (
                  <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      className="size-6"
                      onClick={() => {
                        setRenameTarget({
                          kind: "folder",
                          id: folder.id,
                          name: folder.name,
                        });
                        setRenameValue(folder.name);
                      }}
                      size="icon"
                      title={t("fileManager.rename")}
                      variant="ghost"
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      className="size-6 text-destructive"
                      onClick={() =>
                        setDeleteTarget({
                          kind: "folder",
                          id: folder.id,
                          isMount: Boolean(folder.connectionId),
                          name: folder.name,
                        })
                      }
                      size="icon"
                      title={
                        folder.connectionId
                          ? t("fileManager.sources.removeSource")
                          : t("fileManager.delete")
                      }
                      variant="ghost"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {files.map((file) => {
              const Icon = fileIconFor(file.mimeType);
              return (
                <div
                  className="ui-card-raised ui-card-interactive group relative flex flex-col items-center gap-2 p-3"
                  key={file.id}
                >
                  <button
                    className="flex w-full flex-col items-center gap-2"
                    onClick={() =>
                      onOpenFile ? onOpenFile(file) : void handleDownload(file)
                    }
                    title={onOpenFile ? file.name : t("fileManager.download")}
                    type="button"
                  >
                    <Icon className="size-10 text-muted-foreground" />
                    <span
                      className="w-full truncate text-center font-medium text-xs"
                      title={file.name}
                    >
                      {file.name}
                    </span>
                  </button>
                  <Badge className="text-xxs" variant="secondary">
                    {formatBytes(file.sizeBytes)}
                  </Badge>
                  {!readOnly && (
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        className="size-6"
                        onClick={() => handleDownload(file)}
                        size="icon"
                        title={t("fileManager.download")}
                        variant="ghost"
                      >
                        <Download className="size-3" />
                      </Button>
                      {!file.readOnly && (
                        <>
                          <Button
                            className="size-6"
                            onClick={() => {
                              setRenameTarget({
                                kind: "file",
                                id: file.id,
                                name: file.name,
                              });
                              setRenameValue(file.name);
                            }}
                            size="icon"
                            title={t("fileManager.rename")}
                            variant="ghost"
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            className="size-6 text-destructive"
                            onClick={() =>
                              setDeleteTarget({
                                kind: "file",
                                id: file.id,
                                name: file.name,
                              })
                            }
                            size="icon"
                            title={t("fileManager.delete")}
                            variant="ghost"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Rename dialog ── */}
      <Dialog
        onOpenChange={(open) => !open && setRenameTarget(null)}
        open={renameTarget !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("fileManager.rename")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameTarget && renameValue.trim()) {
                renameMutation.mutate({
                  target: renameTarget,
                  name: renameValue.trim(),
                });
              }
            }}
            value={renameValue}
          />
          <DialogFooter>
            <Button onClick={() => setRenameTarget(null)} variant="outline">
              {t("fileManager.cancel")}
            </Button>
            <Button
              disabled={!renameValue.trim() || renameMutation.isPending}
              onClick={() =>
                renameTarget &&
                renameMutation.mutate({
                  target: renameTarget,
                  name: renameValue.trim(),
                })
              }
            >
              {t("fileManager.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("fileManager.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "folder"
                ? deleteTarget.isMount
                  ? t("fileManager.sources.confirmRemoveSource", {
                      name: deleteTarget?.name ?? "",
                    })
                  : t("fileManager.confirmDeleteFolder", {
                      name: deleteTarget?.name ?? "",
                    })
                : t("fileManager.confirmDeleteFile", {
                    name: deleteTarget?.name ?? "",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("fileManager.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget)
              }
            >
              {t("fileManager.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Self-contained toolbar for hosts that do not share drag-and-drop with the listing. */
export function FileSpaceActionsBar({
  currentFolderId,
  owner,
  readOnly,
}: {
  currentFolderId: string | null;
  owner: FileSpaceOwnerRef;
  readOnly?: boolean;
}) {
  const actions = useFileSpaceActions(owner, currentFolderId, readOnly);
  return (
    <FileSpaceActions
      actions={actions}
      currentFolderId={currentFolderId}
      owner={owner}
    />
  );
}

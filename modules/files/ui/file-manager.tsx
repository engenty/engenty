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
  ChevronRight,
  Download,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createFolder,
  deleteFolder,
  deleteSpaceFile,
  type FileSpaceFile,
  type FileSpaceFolder,
  type FileSpaceOwnerRef,
  getSpaceFileUrl,
  updateFile,
  updateFolder,
  uploadFileToSpace,
} from "./file-manager-api.js";
import {
  fileSpaceInvalidationKey,
  fileSpaceQueryOptions,
} from "./file-manager-queries.js";

export type {
  FileSpaceFile,
  FileSpaceFolder,
  FileSpaceListing,
  FileSpaceOwnerRef,
} from "./file-manager-api.js";

export interface FileManagerProps {
  className?: string;
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
  | { kind: "folder"; id: string; name: string }
  | { kind: "file"; id: string; name: string };

/* ── Component ── */

export function FileManager({ owner, readOnly, className }: FileManagerProps) {
  const { t } = useTranslation("files");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [path, setPath] = useState<Crumb[]>([{ id: null, name: "" }]);
  const currentFolderId = path.at(-1)?.id ?? null;

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, error } = useQuery(
    fileSpaceQueryOptions(owner, { folderId: currentFolderId })
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: fileSpaceInvalidationKey(owner),
    });
  }, [owner, queryClient]);

  /* ── Navigation ── */
  const openFolder = useCallback((folder: FileSpaceFolder) => {
    setPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
  }, []);

  const navigateToCrumb = useCallback((index: number) => {
    setPath((prev) => prev.slice(0, index + 1));
  }, []);

  /* ── Mutations ── */
  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      createFolder(owner, { name, parentId: currentFolderId }),
    onSuccess: () => {
      invalidate();
      setNewFolderOpen(false);
      setNewFolderName("");
    },
    onError: (e: unknown) =>
      toast.error(
        e instanceof Error ? e.message : t("fileManager.errors.generic")
      ),
  });

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

  /* ── Upload ── */
  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) {
        return;
      }
      setUploading(true);
      let ok = 0;
      for (const file of list) {
        try {
          await uploadFileToSpace(owner, file, currentFolderId);
          ok += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "upload_failed";
          toast.error(
            t("fileManager.errors.upload", { filename: file.name, error: msg })
          );
        }
      }
      setUploading(false);
      if (ok > 0) {
        toast.success(t("fileManager.uploadSuccess", { count: ok }));
        invalidate();
      }
    },
    [currentFolderId, invalidate, owner, t]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      e.target.value = "";
      if (files) {
        void uploadFiles(files);
      }
    },
    [uploadFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (readOnly) {
        return;
      }
      if (e.dataTransfer?.files?.length) {
        void uploadFiles(e.dataTransfer.files);
      }
    },
    [readOnly, uploadFiles]
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
        if (!readOnly) {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDrop={handleDrop}
    >
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
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

        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setNewFolderName("");
                setNewFolderOpen(true);
              }}
              size="sm"
              variant="outline"
            >
              <FolderPlus className="mr-1.5 size-4" />
              {t("fileManager.newFolder")}
            </Button>
            <Button
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              size="sm"
            >
              <Upload className="mr-1.5 size-4" />
              {uploading ? t("fileManager.uploading") : t("fileManager.upload")}
            </Button>
            <input
              className="hidden"
              multiple
              onChange={handleInputChange}
              ref={fileInputRef}
              type="file"
            />
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div
        className={`relative flex-1 rounded-lg border ${
          dragActive
            ? "border-primary border-dashed bg-primary/5"
            : "border-border"
        }`}
      >
        {dragActive && !readOnly && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/80 text-sm">
            <UploadCloud className="size-8 text-primary" />
            {t("fileManager.dropHere")}
          </div>
        )}

        {isLoading ? (
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
                className="group relative flex cursor-pointer flex-col items-center gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
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
                {!readOnly && (
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
                          name: folder.name,
                        })
                      }
                      size="icon"
                      title={t("fileManager.delete")}
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
                  className="group relative flex flex-col items-center gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
                  key={file.id}
                >
                  <button
                    className="flex w-full flex-col items-center gap-2"
                    onClick={() => handleDownload(file)}
                    title={t("fileManager.download")}
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── New folder dialog ── */}
      <Dialog onOpenChange={setNewFolderOpen} open={newFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("fileManager.newFolder")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolderName.trim()) {
                createFolderMutation.mutate(newFolderName.trim());
              }
            }}
            placeholder={t("fileManager.folderNamePlaceholder")}
            value={newFolderName}
          />
          <DialogFooter>
            <Button onClick={() => setNewFolderOpen(false)} variant="outline">
              {t("fileManager.cancel")}
            </Button>
            <Button
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              onClick={() => createFolderMutation.mutate(newFolderName.trim())}
            >
              {t("fileManager.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                ? t("fileManager.confirmDeleteFolder", {
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

import { fileSpaceInvalidationKey } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation, useQueryClient } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@engenty/ui-core";
import { FolderPlus, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createFolder,
  type FileSpaceOwnerRef,
  uploadFileToSpace,
} from "../file-manager-api.js";
import { AddSourceMenu } from "./add-source-menu.js";

export function useFileSpaceActions(
  owner: FileSpaceOwnerRef,
  currentFolderId: string | null,
  readOnly?: boolean,
  onMutated?: () => void
) {
  const { t } = useTranslation("files");
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: fileSpaceInvalidationKey(owner),
    });
    onMutated?.();
  }, [onMutated, owner, queryClient]);

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      createFolder(owner, { name, parentId: currentFolderId }),
    onSuccess: () => {
      invalidate();
      setNewFolderOpen(false);
      setNewFolderName("");
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof Error ? error.message : t("fileManager.errors.generic")
      ),
  });

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
        } catch (error) {
          const msg = error instanceof Error ? error.message : "upload_failed";
          toast.error(
            t("fileManager.errors.upload", { error: msg, filename: file.name })
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
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      event.target.value = "";
      if (files) {
        void uploadFiles(files);
      }
    },
    [uploadFiles]
  );

  return {
    createFolderMutation,
    fileInputRef,
    handleInputChange,
    invalidate,
    mutationsDisabled: Boolean(readOnly),
    newFolderName,
    newFolderOpen,
    setNewFolderName,
    setNewFolderOpen,
    uploadFiles,
    uploading,
  };
}

export type FileSpaceActionsState = ReturnType<typeof useFileSpaceActions>;

export function FileSpaceUploadInput({
  actions,
}: {
  actions: FileSpaceActionsState;
}) {
  return (
    <input
      className="hidden"
      multiple
      onChange={actions.handleInputChange}
      ref={actions.fileInputRef}
      type="file"
    />
  );
}

export function FileSpaceFolderDialog({
  actions,
}: {
  actions: FileSpaceActionsState;
}) {
  const { t } = useTranslation("files");
  return (
    <Dialog
      onOpenChange={actions.setNewFolderOpen}
      open={actions.newFolderOpen}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("fileManager.newFolder")}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          onChange={(event) => actions.setNewFolderName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && actions.newFolderName.trim()) {
              actions.createFolderMutation.mutate(actions.newFolderName.trim());
            }
          }}
          placeholder={t("fileManager.folderNamePlaceholder")}
          value={actions.newFolderName}
        />
        <DialogFooter>
          <Button
            onClick={() => actions.setNewFolderOpen(false)}
            variant="outline"
          >
            {t("fileManager.cancel")}
          </Button>
          <Button
            disabled={
              !actions.newFolderName.trim() ||
              actions.createFolderMutation.isPending
            }
            onClick={() =>
              actions.createFolderMutation.mutate(actions.newFolderName.trim())
            }
          >
            {t("fileManager.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Connect / New folder / Upload — the CTAs the Data dashboard and FileManager share. */
export function FileSpaceActions({
  actions,
  currentFolderId,
  owner,
}: {
  actions: FileSpaceActionsState;
  currentFolderId: string | null;
  owner: FileSpaceOwnerRef;
}) {
  const { t } = useTranslation("files");

  if (actions.mutationsDisabled) {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <AddSourceMenu currentFolderId={currentFolderId} owner={owner} />
        <Button
          onClick={() => {
            actions.setNewFolderName("");
            actions.setNewFolderOpen(true);
          }}
          size="sm"
          variant="outline"
        >
          <FolderPlus className="mr-1.5 size-4" />
          {t("fileManager.newFolder")}
        </Button>
        <Button
          disabled={actions.uploading}
          onClick={() => actions.fileInputRef.current?.click()}
          size="sm"
        >
          <Upload className="mr-1.5 size-4" />
          {actions.uploading
            ? t("fileManager.uploading")
            : t("fileManager.upload")}
        </Button>
        <FileSpaceUploadInput actions={actions} />
      </div>
      <FileSpaceFolderDialog actions={actions} />
    </>
  );
}

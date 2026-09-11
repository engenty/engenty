/**
 * Pick a file connection, then the folder on it to mount into this file space.
 *
 * One dialog, two steps: the source list first, the folder browser second.
 * The File Manager toolbar and the Data-tab Dateien "+" both open this — a
 * dropdown of sources next to a second picker was two menus for one job.
 */
import {
  canGrantLocalFolder,
  grantLocalFolder,
} from "@engenty/connections-local-files/ui/grant-local-folder";
import { useLocalFilesBridge } from "@engenty/connections-local-files/ui/local-files-bridge";
import { fileSpaceInvalidationKey } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery, useQueryClient } from "@engenty/query-client";
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
import { ConnectorLogoImg, connectorLogoSvg } from "@engenty/ui-icons";
import { Cable, ChevronRight, Folder, HardDrive } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  browseFileSource,
  createMount,
  type FileSourceSummary,
  type FileSpaceOwnerRef,
  listFileSources,
} from "../file-manager-api.js";

interface PickerCrumb {
  name: string;
  ref: string | null;
}

export function ConnectFolderDialog({
  currentFolderId,
  onMounted,
  onOpenChange,
  open,
  owner,
}: {
  currentFolderId: string | null;
  onMounted?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  owner: FileSpaceOwnerRef;
}) {
  const { t } = useTranslation("files");
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState<FileSourceSummary | null>(null);
  const [path, setPath] = useState<PickerCrumb[]>([]);
  const [mounting, setMounting] = useState(false);
  const spaceId = owner.type === "space" ? owner.id : null;
  const localAvailable = canGrantLocalFolder();
  const { ready: localFilesReady } = useLocalFilesBridge(open);

  useEffect(() => {
    if (!open) {
      setPicking(null);
      setPath([]);
    }
  }, [open]);

  const sourcesQuery = useQuery({
    enabled: open,
    queryFn: ({ signal }) => listFileSources(signal),
    queryKey: ["files", "sources"],
    staleTime: 30_000,
  });
  const sources = sourcesQuery.data?.sources ?? [];

  const currentRef = path.at(-1)?.ref ?? null;
  const browseQuery = useQuery({
    enabled: open && picking !== null && localFilesReady,
    queryFn: ({ signal }) =>
      browseFileSource(
        picking?.connectionId ?? "",
        { folderRef: currentRef },
        signal
      ),
    queryKey: [
      "files",
      "sources",
      picking?.connectionId ?? "",
      "browse",
      currentRef ?? "",
    ],
    staleTime: 10_000,
  });

  const mount = useCallback(async () => {
    if (!picking) {
      return;
    }
    setMounting(true);
    try {
      const name = path.at(-1)?.name ?? picking.label;
      await createMount(owner, {
        connectionId: picking.connectionId,
        folderRef: currentRef,
        name,
        parentId: currentFolderId,
      });
      await queryClient.invalidateQueries({
        queryKey: fileSpaceInvalidationKey(owner),
      });
      await queryClient.invalidateQueries({ queryKey: ["files", "sources"] });
      onMounted?.();
      onOpenChange(false);
      toast.success(t("fileManager.sources.mounted", { name }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("fileManager.errors.generic")
      );
    } finally {
      setMounting(false);
    }
  }, [
    currentFolderId,
    currentRef,
    onMounted,
    onOpenChange,
    owner,
    path,
    picking,
    queryClient,
    t,
  ]);

  const connectThisComputer = useCallback(async () => {
    setMounting(true);
    try {
      const granted = await grantLocalFolder({ spaceId });
      if (!granted) {
        return;
      }
      await createMount(owner, {
        connectionId: granted.connectionId,
        folderRef: null,
        name: granted.name,
        parentId: currentFolderId,
      });
      await queryClient.invalidateQueries({
        queryKey: fileSpaceInvalidationKey(owner),
      });
      await queryClient.invalidateQueries({ queryKey: ["files", "sources"] });
      onMounted?.();
      onOpenChange(false);
      toast.success(t("fileManager.sources.mounted", { name: granted.name }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      toast.error(
        error instanceof Error ? error.message : t("fileManager.errors.generic")
      );
    } finally {
      setMounting(false);
    }
  }, [
    currentFolderId,
    onMounted,
    onOpenChange,
    owner,
    queryClient,
    spaceId,
    t,
  ]);

  const folders = (browseQuery.data?.entries ?? []).filter(
    (entry) => entry.kind === "folder"
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        {picking ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {t("fileManager.sources.pickTitle", { name: picking.label })}
              </DialogTitle>
              <DialogDescription>
                {t("fileManager.sources.pickDescription")}
              </DialogDescription>
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
                {picking.label}
              </button>
              {path.map((crumb, index) => (
                <span
                  className="flex items-center gap-1"
                  key={crumb.ref ?? index}
                >
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
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton className="h-8" key={`ps-${index}`} />
                  ))}
                </div>
              ) : browseQuery.error ? (
                <div className="p-3 text-destructive text-sm">
                  {browseQuery.error instanceof Error
                    ? browseQuery.error.message
                    : t("fileManager.errors.generic")}
                </div>
              ) : folders.length === 0 ? (
                <div className="p-3 text-muted-foreground text-sm">
                  {t("fileManager.sources.noSubfolders")}
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
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setPicking(null);
                  setPath([]);
                }}
                type="button"
                variant="outline"
              >
                {t("fileManager.cancel")}
              </Button>
              <Button
                disabled={mounting}
                onClick={() => void mount()}
                type="button"
              >
                {mounting
                  ? t("fileManager.sources.mounting")
                  : t("fileManager.sources.useThisFolder")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {t("fileManager.sources.connectFolder")}
              </DialogTitle>
              <DialogDescription>
                {t("fileManager.sources.pickSource", {
                  defaultValue:
                    "Connect a folder from this computer, or choose an account already connected.",
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-72 min-h-40 overflow-y-auto rounded-md border">
              {sourcesQuery.isLoading ? (
                <div className="flex flex-col gap-2 p-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton className="h-8" key={`src-${index}`} />
                  ))}
                </div>
              ) : (
                <ul>
                  {localAvailable ? (
                    <li>
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/40"
                        disabled={mounting}
                        onClick={() => void connectThisComputer()}
                        type="button"
                      >
                        <HardDrive className="size-4 shrink-0 text-primary/70" />
                        <span className="truncate">
                          {t("fileManager.sources.thisComputer", {
                            defaultValue: "This computer",
                          })}
                        </span>
                      </button>
                    </li>
                  ) : null}
                  {sources.map((source) => (
                    <li key={source.connectionId}>
                      <button
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/40"
                        onClick={() => {
                          setPath([]);
                          setPicking(source);
                        }}
                        type="button"
                      >
                        {connectorLogoSvg(source.connectorIcon) ? (
                          <ConnectorLogoImg
                            className="size-4 shrink-0 object-contain"
                            icon={source.connectorIcon}
                            size={16}
                          />
                        ) : (
                          <Cable
                            aria-hidden
                            className="size-4 shrink-0 text-muted-foreground"
                          />
                        )}
                        <span className="truncate">{source.label}</span>
                      </button>
                    </li>
                  ))}
                  {localAvailable || sources.length > 0 ? null : (
                    <li className="p-3 text-muted-foreground text-sm">
                      {t("fileManager.sources.none")}
                    </li>
                  )}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                {t("fileManager.cancel")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

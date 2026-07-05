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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
} from "@engenty/ui-core";
import { ConnectorLogoImg, connectorLogoSvg } from "@engenty/ui-icons";
import { Cable, ChevronRight, Folder, Link2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  browseFileSource,
  createMount,
  type FileSourceSummary,
  type FileSpaceOwnerRef,
  listFileSources,
} from "../file-manager-api.js";
import { fileSpaceInvalidationKey } from "../file-manager-queries.js";

interface PickerCrumb {
  name: string;
  ref: string | null;
}

/**
 * "Connect folder" dropdown for a file space: lists file-capable connections
 * (Google Drive, OneDrive, S3, local browser folders), then opens a picker to
 * choose the provider folder that gets mounted at the current location.
 */
export function AddSourceMenu({
  currentFolderId,
  owner,
}: {
  currentFolderId: string | null;
  owner: FileSpaceOwnerRef;
}) {
  const { t } = useTranslation("files");
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState<FileSourceSummary | null>(null);
  const [path, setPath] = useState<PickerCrumb[]>([]);
  const [mounting, setMounting] = useState(false);

  const sourcesQuery = useQuery({
    queryKey: ["files", "sources"],
    queryFn: ({ signal }) => listFileSources(signal),
    staleTime: 30_000,
  });
  const sources = sourcesQuery.data?.sources ?? [];

  const currentRef = path.at(-1)?.ref ?? null;
  const browseQuery = useQuery({
    enabled: picking !== null,
    queryKey: [
      "files",
      "sources",
      picking?.connectionId ?? "",
      "browse",
      currentRef ?? "",
    ],
    queryFn: ({ signal }) =>
      browseFileSource(
        picking?.connectionId ?? "",
        { folderRef: currentRef },
        signal
      ),
    staleTime: 10_000,
  });

  const openPicker = useCallback((source: FileSourceSummary) => {
    setPath([]);
    setPicking(source);
  }, []);

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
      setPicking(null);
      toast.success(t("fileManager.sources.mounted", { name }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("fileManager.errors.generic")
      );
    } finally {
      setMounting(false);
    }
  }, [currentFolderId, currentRef, owner, path, picking, queryClient, t]);

  const folders = (browseQuery.data?.entries ?? []).filter(
    (entry) => entry.kind === "folder"
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" type="button" variant="outline">
            <Link2 className="mr-1.5 size-4" />
            {t("fileManager.sources.connectFolder")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {sources.length === 0 ? (
            <DropdownMenuItem
              onSelect={() => {
                window.location.assign("/settings/connections");
              }}
            >
              {t("fileManager.sources.none")}
            </DropdownMenuItem>
          ) : (
            sources.map((source) => (
              <DropdownMenuItem
                className="gap-2"
                key={source.connectionId}
                onSelect={() => openPicker(source)}
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
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Folder picker ── */}
      <Dialog
        onOpenChange={(open) => !open && setPicking(null)}
        open={picking !== null}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("fileManager.sources.pickTitle", {
                name: picking?.label ?? "",
              })}
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
              {picking?.label}
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
                  <Skeleton className="h-8" key={`ps-${i}`} />
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
              onClick={() => setPicking(null)}
              type="button"
              variant="outline"
            >
              {t("fileManager.cancel")}
            </Button>
            <Button disabled={mounting} onClick={() => void mount()} type="button">
              {mounting
                ? t("fileManager.sources.mounting")
                : t("fileManager.sources.useThisFolder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

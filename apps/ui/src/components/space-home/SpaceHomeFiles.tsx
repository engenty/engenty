/**
 * The home's Files box — a small dropzone onto the space's own file space
 * (Data → Files), plus connected folders. Uploads and connects use the same
 * store and invalidation as the Files section in the sidebar.
 */
import {
  fileSpaceInvalidationKey,
  fileSpaceOwnerKey,
  type SpaceDriveFile,
  type SpaceDriveFolder,
  spaceDriveRootOwner,
} from "@engenty/file-storage";
import { ConnectFolderDialog } from "@engenty/files-ui/ui/components/connect-folder-dialog";
import { useFileSpaceActions } from "@engenty/files-ui/ui/components/file-space-actions";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery, useQueryClient } from "@engenty/query-client";
import { Collapsible, CollapsibleContent, cn } from "@engenty/ui-core";
import { File, Folder, Upload } from "lucide-react";
import { type DragEvent, useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FILES_DATA_ROOT } from "@/components/spaces/space-data/connected-folder";
import { SpaceSectionAddButton } from "@/components/spaces/space-section-heading";
import { getFileSpaceListing } from "@/lib/api/space-drive-client";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import {
  SPACE_HOME_FILES_SHOWN,
  selectSpaceHomeConnectedFolders,
  selectSpaceHomeListedFiles,
  takeDroppedFiles,
} from "@/lib/space-home-files";
import {
  spaceDataFilePath,
  spaceDataFolderInSpacePath,
  spaceDataFolderPath,
} from "@/lib/space-routes";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";

export function SpaceHomeFiles({
  spaceId,
  spaceKey,
}: {
  spaceId: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const client = useQueryClient();
  const owner = useMemo(() => spaceDriveRootOwner(spaceId), [spaceId]);
  const fileSpaceKey = fileSpaceOwnerKey(owner);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.homeFiles,
    spaceKey
  );

  const invalidate = useCallback(() => {
    void client.invalidateQueries({
      queryKey: fileSpaceInvalidationKey(owner),
    });
    void client.invalidateQueries({
      queryKey: spaceDriveKeys.dataRoots(spaceId),
    });
    void client.invalidateQueries({
      queryKey: [...spaceDriveKeys.dataChildren(spaceId, "")].slice(0, -1),
    });
  }, [client, owner, spaceId]);

  const actions = useFileSpaceActions(owner, null, false, invalidate);
  const listingQuery = useQuery({
    enabled: open,
    queryFn: ({ signal }) => getFileSpaceListing(owner, null, signal),
    queryKey: spaceDriveKeys.folder(owner, null),
  });
  const connected = useMemo(
    () => selectSpaceHomeConnectedFolders(listingQuery.data?.folders ?? []),
    [listingQuery.data?.folders]
  );
  const files = useMemo(
    () => selectSpaceHomeListedFiles(listingQuery.data?.files ?? []),
    [listingQuery.data?.files]
  );
  const shownConnected = connected.slice(0, SPACE_HOME_FILES_SHOWN);
  const shownFiles = files.slice(0, SPACE_HOME_FILES_SHOWN);
  const filesHref = spaceDataFolderPath(spaceKey, FILES_DATA_ROOT);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const list = takeDroppedFiles(event.dataTransfer.files);
    if (list.length > 0) {
      void actions.uploadFiles(list);
    }
  };

  const addLabel = t("spaces.home.files.upload", {
    defaultValue: "Upload files",
  });
  const busy = actions.uploading;

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceHomeSectionHeading
        action={
          <SpaceSectionAddButton
            aria-label={addLabel}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          />
        }
        onOpenChange={setOpen}
        open={open}
      >
        {t("spaces.home.files.title", { defaultValue: "Files" })}
      </SpaceHomeSectionHeading>
      <CollapsibleContent>
        <div className="ui-card-raised flex flex-col rounded-[14px] px-1.5 py-1">
          <label
            aria-busy={busy}
            className={cn(
              "mx-0.5 mt-1 mb-1 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed px-2 text-[12px] transition-colors",
              dragging
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              busy && "pointer-events-none opacity-60"
            )}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDrop={onDrop}
          >
            <Upload aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">
              {busy
                ? t("spaces.home.files.uploading", {
                    defaultValue: "Uploading…",
                  })
                : t("spaces.home.files.drop", {
                    defaultValue: "Drop files here",
                  })}
            </span>
            <input
              className="sr-only"
              disabled={busy}
              multiple
              onChange={(event) => {
                const list = takeDroppedFiles(event.target.files);
                event.target.value = "";
                if (list.length > 0) {
                  void actions.uploadFiles(list);
                }
              }}
              ref={inputRef}
              type="file"
            />
          </label>
          {listingQuery.error ? (
            <p className="px-2 py-2 text-[12px] text-destructive">
              {t("spaces.home.files.loadFailed", {
                defaultValue: "Files could not be loaded.",
              })}
            </p>
          ) : null}
          {shownConnected.map((folder) => (
            <ConnectedRow
              fileSpaceKey={fileSpaceKey}
              folder={folder}
              key={folder.id}
              spaceKey={spaceKey}
            />
          ))}
          {shownFiles.map((file) => (
            <FileRow
              file={file}
              fileSpaceKey={fileSpaceKey}
              key={file.id}
              spaceKey={spaceKey}
            />
          ))}
          <button
            className="px-2 py-2 text-left font-medium text-[12px] text-primary hover:underline"
            onClick={() => setConnectOpen(true)}
            type="button"
          >
            {t("spaces.home.files.connect", { defaultValue: "Connect" })}
          </button>
          {connected.length > 0 || files.length > 0 ? (
            <Link
              className="px-2 py-2 font-medium text-[12px] text-primary hover:underline"
              to={filesHref}
            >
              {t("spaces.home.files.all", { defaultValue: "All" })}
            </Link>
          ) : null}
        </div>
      </CollapsibleContent>
      <ConnectFolderDialog
        currentFolderId={null}
        onMounted={invalidate}
        onOpenChange={setConnectOpen}
        open={connectOpen}
        owner={owner}
      />
    </Collapsible>
  );
}

function ConnectedRow({
  fileSpaceKey,
  folder,
  spaceKey,
}: {
  fileSpaceKey: string;
  folder: SpaceDriveFolder;
  spaceKey: string;
}) {
  return (
    <Link
      className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 hover:bg-accent/60"
      to={spaceDataFolderInSpacePath(spaceKey, {
        fileSpaceKey,
        id: folder.id,
      })}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-muted text-muted-foreground">
        <Folder className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-[13px]">
        {folder.name}
      </span>
    </Link>
  );
}

function FileRow({
  file,
  fileSpaceKey,
  spaceKey,
}: {
  file: SpaceDriveFile;
  fileSpaceKey: string;
  spaceKey: string;
}) {
  return (
    <Link
      className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 hover:bg-accent/60"
      to={spaceDataFilePath(spaceKey, {
        fileSpaceKey,
        folderId: file.folderId,
        id: file.id,
      })}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-muted text-muted-foreground">
        <File className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-[13px]">
        {file.name}
      </span>
    </Link>
  );
}

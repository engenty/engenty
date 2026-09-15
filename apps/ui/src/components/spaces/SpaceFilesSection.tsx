/**
 * The space's Files on the Work tab: what this person pinned, then the five
 * touched most recently — not the whole file space, which is Data's job.
 *
 * Shown only where the `files` module is mounted (mount = grant), exactly
 * like the Files root in Data. A row opens the file in the Data pane; its ⋯
 * pins or unpins. Pinning is personal navigation, not ownership: the file
 * stays in its folder, the pin puts it on THIS sidebar.
 */

import {
  type FileSpaceOwnerRef,
  fileSpaceOwnerKey,
  type SpaceDriveFile,
  spaceFileSpaceOwner,
} from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { FileText, MoreVertical, Pin, PinOff } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SpaceSectionHeading } from "@/components/spaces/space-section-heading";
import { useSpaceFilesShortcuts } from "@/lib/api/space-files-shortcuts-client";
import { useSpaceDataReturnState } from "@/lib/space-data-return";
import { spaceDataFilePath, spaceDataPath } from "@/lib/space-routes";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";

/** The Data root the heading links to — the files module's adapter root. */
const FILES_DATA_ROOT = "Files";

export function SpaceFilesSection({
  filesMounted,
  spaceId,
  spaceKey,
}: {
  /** The `files` module is mounted in this space; without it there is no list. */
  filesMounted: boolean;
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const returnState = useSpaceDataReturnState();
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.files,
    spaceKey
  );
  const [searchParams] = useSearchParams();
  const openFileId = searchParams.get("file");

  const owner = useMemo<FileSpaceOwnerRef | null>(
    () => (spaceId && filesMounted ? spaceFileSpaceOwner(spaceId) : null),
    [filesMounted, spaceId]
  );
  const shortcuts = useSpaceFilesShortcuts(owner);

  if (!(spaceId && owner)) {
    return null;
  }
  const fileSpaceKey = fileSpaceOwnerKey(owner);
  const isEmpty =
    !shortcuts.isPending &&
    shortcuts.pinned.length === 0 &&
    shortcuts.recent.length === 0;

  const renderRow = (file: SpaceDriveFile, pinned: boolean) => {
    const active = openFileId === file.id;
    return (
      <div className="group/item relative" key={file.id}>
        <Link
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-[8px] px-2 py-0.5 text-foreground text-sm transition",
            active ? "bg-muted font-semibold" : "hover:bg-muted/60"
          )}
          state={returnState}
          to={spaceDataFilePath(spaceKey, {
            fileSpaceKey,
            folderId: file.folderId ?? null,
            id: file.id,
          })}
        >
          <FileText aria-hidden className="size-4 shrink-0 opacity-70" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          {pinned ? (
            <Pin
              aria-hidden
              className="size-3 shrink-0 text-muted-foreground group-hover/item:opacity-0"
            />
          ) : null}
        </Link>
        <span className="pointer-events-none absolute top-0 right-1 z-10 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/item:pointer-events-auto group-hover/item:opacity-100 has-data-[state=open]:pointer-events-auto has-data-[state=open]:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("actions.more", { defaultValue: "More actions" })}
                className="size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                data-row-menu-trigger
                size="icon"
                variant="ghost"
              >
                <MoreVertical aria-hidden className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem
                disabled={shortcuts.toggling}
                onSelect={() => shortcuts.setPinned(file.id, !pinned)}
              >
                {pinned ? (
                  <PinOff aria-hidden className="size-4" />
                ) : (
                  <Pin aria-hidden className="size-4" />
                )}
                {pinned
                  ? t("spaces.files.unpin", { defaultValue: "Unpin" })
                  : t("spaces.files.pin", { defaultValue: "Pin" })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
    );
  };

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceSectionHeading
        onOpenChange={setOpen}
        open={open}
        to={spaceDataPath(spaceKey, FILES_DATA_ROOT)}
      >
        {t("spaces.files.section", { defaultValue: "Files" })}
      </SpaceSectionHeading>

      <CollapsibleContent>
        {shortcuts.isPending ? (
          <div className="flex flex-col gap-1">
            {[0, 1].map((index) => (
              <div
                className="h-7 animate-pulse rounded-[8px] bg-muted"
                key={index}
              />
            ))}
          </div>
        ) : null}
        {isEmpty ? (
          <p className="px-2 text-muted-foreground text-xs">
            {shortcuts.isError
              ? t("spaces.files.loadFailed", {
                  defaultValue: "Files could not be loaded.",
                })
              : t("spaces.files.empty", {
                  defaultValue: "Recent and pinned files show up here.",
                })}
          </p>
        ) : null}
        {shortcuts.pinned.map((file) => renderRow(file, true))}
        {shortcuts.recent.length > 0 ? (
          <>
            {shortcuts.pinned.length > 0 ? (
              <p className="px-2 pt-1 text-[11px] text-muted-foreground">
                {t("spaces.files.recent", { defaultValue: "Recent" })}
              </p>
            ) : null}
            {shortcuts.recent.map((file) => renderRow(file, false))}
          </>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

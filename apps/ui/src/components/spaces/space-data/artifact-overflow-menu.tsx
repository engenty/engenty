import { useTranslation } from "@engenty/i18n/ui";
import { DropdownMenuItem, DropdownMenuSeparator } from "@engenty/ui-core";
import {
  Copy,
  Eye,
  FolderInput,
  History,
  Link2,
  Pencil,
  PencilLine,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { ArtifactOverflowCapabilities } from "./artifact-overflow-capabilities";
import { SpaceArtifactPinMenuItem } from "./space-artifact-pin-menu-item";

export function ArtifactOverflowMenuItems({
  artifactId,
  capabilities,
  includeOpen,
  onCopyLink,
  onDelete,
  onDuplicate,
  onEdit,
  onMove,
  onOpen,
  onRename,
  onVersions,
  pending,
  spaceId,
}: {
  artifactId: string;
  capabilities: ArtifactOverflowCapabilities;
  includeOpen?: boolean;
  onCopyLink: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onMove: () => void;
  onOpen?: () => void;
  onRename: () => void;
  onVersions: () => void;
  pending: boolean;
  spaceId: string | null;
}) {
  const { t } = useTranslation("common");
  const editKind = capabilities.edit;
  return (
    <>
      <SpaceArtifactPinMenuItem artifactId={artifactId} spaceId={spaceId} />
      {includeOpen && onOpen ? (
        <DropdownMenuItem onSelect={onOpen}>
          <Eye className="mr-2 size-4" />
          {t("spaces.data.artifact.open", { defaultValue: "Open" })}
        </DropdownMenuItem>
      ) : null}
      {editKind === "page" || editKind === "copilot" ? (
        <DropdownMenuItem onSelect={onEdit}>
          {editKind === "copilot" ? (
            <Sparkles className="mr-2 size-4" />
          ) : (
            <Pencil className="mr-2 size-4" />
          )}
          {t("spaces.data.artifact.edit", { defaultValue: "Edit" })}
        </DropdownMenuItem>
      ) : null}
      {editKind === "rename" ? (
        <DropdownMenuItem onSelect={onRename}>
          <PencilLine className="mr-2 size-4" />
          {t("spaces.data.artifact.rename", { defaultValue: "Rename" })}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      {capabilities.duplicate ? (
        <DropdownMenuItem disabled={pending} onSelect={() => onDuplicate()}>
          <Copy className="mr-2 size-4" />
          {t("spaces.data.artifact.duplicate", { defaultValue: "Duplicate" })}
        </DropdownMenuItem>
      ) : null}
      {capabilities.move ? (
        <DropdownMenuItem onSelect={onMove}>
          <FolderInput className="mr-2 size-4" />
          {t("spaces.data.artifact.move", { defaultValue: "Move" })}
        </DropdownMenuItem>
      ) : null}
      {capabilities.versions ? (
        <DropdownMenuItem onSelect={onVersions}>
          <History className="mr-2 size-4" />
          {t("spaces.data.artifact.history", { defaultValue: "Versions" })}
        </DropdownMenuItem>
      ) : null}
      {capabilities.copyLink ? (
        <DropdownMenuItem onSelect={onCopyLink}>
          <Link2 className="mr-2 size-4" />
          {t("spaces.data.artifact.copyLink", { defaultValue: "Copy link" })}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onDelete} variant="destructive">
        <Trash2 className="mr-2 size-4" />
        {t("spaces.data.artifact.delete", { defaultValue: "Delete" })}
      </DropdownMenuItem>
    </>
  );
}

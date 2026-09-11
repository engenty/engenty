/**
 * Artifacts tree-row ⋯ — Open, Edit (or Rename / Copilot), then organize,
 * versions, copy link, delete. Handle types skip duplicate; folders skip
 * versions and rename instead of editing content.
 */
import type { DriveNode } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isArtifactTreeNode } from "@/lib/space-data-root-sections";
import { spaceDataArtifactPath } from "@/lib/space-routes";
import { useAskCopilotSidebar } from "@/lib/use-ask-copilot-sidebar";
import {
  artifactCopilotEditPrompt,
  useArtifactOverflow,
} from "./artifact-overflow";
import { ArtifactOverflowMenuItems } from "./artifact-overflow-menu";

export function ArtifactRowActions({
  node,
  spaceId,
  spaceKey,
}: {
  node: DriveNode;
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const askCopilot = useAskCopilotSidebar();
  const type = node.nodeType ?? "markdown";
  const overflow = useArtifactOverflow({
    artifactId: node.sourceId,
    spaceId,
    spaceKey,
    title: node.name,
    type,
  });

  if (!(spaceId && isArtifactTreeNode(node))) {
    return null;
  }

  const onEdit = () => {
    if (overflow.capabilities.edit === "page") {
      navigate(spaceDataArtifactPath(spaceKey, node.sourceId, { edit: true }));
      return;
    }
    if (overflow.capabilities.edit === "copilot") {
      askCopilot(artifactCopilotEditPrompt(type, node.name, t));
    }
  };

  return (
    <>
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
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          <ArtifactOverflowMenuItems
            artifactId={node.sourceId}
            capabilities={overflow.capabilities}
            includeOpen
            onCopyLink={overflow.copyLink}
            onDelete={overflow.openDelete}
            onDuplicate={() => void overflow.duplicate()}
            onEdit={onEdit}
            onMove={overflow.openMove}
            onOpen={() =>
              navigate(spaceDataArtifactPath(spaceKey, node.sourceId))
            }
            onRename={overflow.openRename}
            onVersions={overflow.openHistory}
            pending={overflow.pending}
            spaceId={spaceId}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {overflow.dialogs}
    </>
  );
}

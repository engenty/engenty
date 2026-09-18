/**
 * The artifacts this person pinned in the space — the Work-tab list beside
 * its conversations. An empty list stays off the sidebar until something is
 * pinned, the same way empty Räume and Direkt do.
 *
 * Pinning is personal nav, not ownership: an artifact still lives in Data
 * (`scope_type: 'space'`). The pin is what puts it on this list and on the
 * dashboard. A row opens the artifact in the Data pane; its ⋯ is the Data
 * tree's menu, with Pin first.
 */

import { buildSpaceDrive, type DriveNode } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Collapsible, CollapsibleContent, cn } from "@engenty/ui-core";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArtifactRowActions } from "@/components/spaces/space-data/artifact-row-actions";
import { driveNodeIcon } from "@/components/spaces/space-data/drive-kind-icon";
import { SpaceSectionHeading } from "@/components/spaces/space-section-heading";
import { getSpaceArtifacts } from "@/lib/api/space-drive-client";
import { useSpaceArtifactPins } from "@/lib/space-artifact-pins-persistence";
import { useSpaceDataReturnState } from "@/lib/space-data-return";
import { isArtifactTreeNode } from "@/lib/space-data-root-sections";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import { spaceDataArtifactPath, spaceDataPath } from "@/lib/space-routes";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";

function flattenArtifactNodes(nodes: readonly DriveNode[]): DriveNode[] {
  const out: DriveNode[] = [];
  const walk = (list: readonly DriveNode[]) => {
    for (const node of list) {
      if (isArtifactTreeNode(node)) {
        out.push(node);
        if (node.children?.length) {
          walk(node.children);
        }
      }
    }
  };
  walk(nodes);
  return out;
}

export function SpaceArtifactsSection({
  spaceId,
  spaceKey,
}: {
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const returnState = useSpaceDataReturnState();
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.artifacts,
    spaceKey
  );
  const [searchParams] = useSearchParams();
  const openArtifactId = searchParams.get("artifact");

  const artifactsQuery = useQuery({
    enabled: Boolean(spaceId),
    queryFn: ({ signal }) => getSpaceArtifacts(spaceId ?? "", signal),
    queryKey: spaceDriveKeys.artifacts(spaceId ?? ""),
  });
  const knownIds = artifactsQuery.data?.map((artifact) => artifact.id);
  const pins = useSpaceArtifactPins(spaceId, knownIds);

  const nodes = useMemo<DriveNode[]>(() => {
    const tree = buildSpaceDrive({
      artifacts: artifactsQuery.data ?? [],
      dataRoots: [],
      projects: [],
      spaceId: spaceId ?? "",
    });
    const byId = new Map(
      flattenArtifactNodes(tree).map((node) => [node.sourceId, node])
    );
    return pins.pinned.flatMap((id) => {
      const node = byId.get(id);
      return node ? [node] : [];
    });
  }, [artifactsQuery.data, pins.pinned, spaceId]);

  if (!spaceId || nodes.length === 0) {
    return null;
  }

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceSectionHeading
        count={nodes.length}
        onOpenChange={setOpen}
        open={open}
        to={spaceDataPath(spaceKey)}
      >
        {t("spaces.artifacts.section", { defaultValue: "Artifacts" })}
      </SpaceSectionHeading>

      <CollapsibleContent>
        {nodes.map((node) => {
          const Icon = driveNodeIcon(node);
          const active = openArtifactId === node.sourceId;
          return (
            <div className="group/item relative" key={node.id}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-[8px] px-2 py-0.5 text-foreground text-sm transition",
                  active ? "bg-muted font-semibold" : "hover:bg-muted/60"
                )}
                state={returnState}
                to={spaceDataArtifactPath(spaceKey, node.sourceId)}
              >
                <Icon aria-hidden className="size-4 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
              </Link>
              {/* Over the row, not beside it — the same overlay the
                  conversation rows use, so no width is reserved for a button
                  that is invisible most of the time. */}
              <span className="pointer-events-none absolute top-0 right-1 z-10 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/item:pointer-events-auto group-hover/item:opacity-100 has-data-[state=open]:pointer-events-auto has-data-[state=open]:opacity-100">
                <ArtifactRowActions
                  node={node}
                  spaceId={spaceId}
                  spaceKey={spaceKey}
                />
              </span>
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

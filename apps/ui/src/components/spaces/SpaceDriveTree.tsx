/**
 * The space Data tree, rendered (PLAN-space-data.md D1).
 *
 * One tree over every store a space touches: its own files, connected folders,
 * projects and their file spaces, artifacts (markdown pages mixed with other
 * formats), and the records of every mounted module through their data
 * adapters. Knowledge Base appears only when that module is mounted.
 *
 * The top level is not a flat list of folders. Each root TYPE is a section
 * heading (Contacts, Files, Artifacts) — the same chrome as the Work tab's
 * Agents / Modules / People — and the tree rows live inside it.
 */
import type { DriveNode } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { Spinner } from "@engenty/ui-core";
import { FolderPlus } from "lucide-react";
import type { ReactNode } from "react";
import {
  type DriveRowContext,
  RootSectionBody,
} from "@/components/spaces/space-data/drive-row";
import { SpaceDataRootSection } from "@/components/spaces/space-data/root-section";
import type { SpaceSectionAddItem } from "@/components/spaces/space-section-heading";
import type { SpaceDataCapabilities } from "@/lib/api/space-data-client";
import {
  ARTIFACTS_SECTION_ID,
  groupSpaceDataRootSections,
  spaceDataSectionContainsSelection,
} from "@/lib/space-data-root-sections";
import { spaceDataSectionHeadingLabel } from "@/lib/space-data-section-label";
import { driveNodeHref } from "@/lib/space-drive-href";
import { spaceDataArtifactsPath } from "@/lib/space-routes";

export interface SpaceDriveAddInput {
  kind: "folder" | "page";
  parentPath: string;
}

export interface SpaceDriveTreeProps {
  artifactsAddItems?: readonly SpaceSectionAddItem[];
  canRename?: (node: DriveNode) => boolean;
  capabilitiesByRoot?: Record<string, SpaceDataCapabilities>;
  draggingNode?: DriveNode | null;
  filesAddItems?: readonly SpaceSectionAddItem[];
  isAddBusy?: boolean;
  isPending: boolean;
  /** Translated module names, so Contacts reads as Kontakte in the heading. */
  labelsByModuleId?: Record<string, string>;
  nodes: DriveNode[];
  onAdd?: (input: SpaceDriveAddInput) => void;
  onDragEnd?: () => void;
  onDragStart?: (node: DriveNode) => void;
  onMoveInto?: (source: DriveNode, target: DriveNode) => void;
  onRename?: (node: DriveNode, name: string) => void | Promise<void>;
  /** Called when a leaf is opened — a record, a file, or a reference to one. */
  onSelect?: (node: DriveNode) => void | Promise<void>;
  /** Per-row actions; see {@link DriveRowContext.renderRowActions}. */
  renderRowActions?: (node: DriveNode) => ReactNode;
  /** Id of the space artifact the detail pane is showing. */
  selectedArtifactId?: string;
  /** True when the pane is the Artifacts / Ablage root listing. */
  selectedArtifactsRoot?: boolean;
  /** Id of the file the detail pane is showing. */
  selectedFileId?: string;
  /** Id of the file-space folder or mount the detail pane is showing. */
  selectedFolderId?: string;
  /** Data path of the record the detail pane is showing. */
  selectedPath?: string;
  /** Needed to fetch a module folder's children when it is opened. */
  spaceId?: string | null;
  /** Persistence + heading links are per space. */
  spaceKey: string;
  /** Source names that failed to load, if any. */
  unavailable: string[];
}

/**
 * Renders sidebar-shaped: tight rows, no chrome. The full-page rendering
 * (Kind chips, bordered card, an intro paragraph) died with the Drive page —
 * the sidebar is this tree's only home now, so its variant is the component.
 */
export function SpaceDriveTree({
  artifactsAddItems = [],
  canRename,
  capabilitiesByRoot = {},
  draggingNode = null,
  filesAddItems = [],
  isAddBusy = false,
  isPending,
  labelsByModuleId = {},
  nodes,
  onAdd,
  onDragEnd,
  onDragStart,
  onMoveInto,
  onRename,
  onSelect,
  renderRowActions,
  selectedArtifactId,
  selectedArtifactsRoot = false,
  selectedFileId,
  selectedFolderId,
  selectedPath,
  spaceId = null,
  spaceKey,
  unavailable,
}: SpaceDriveTreeProps) {
  const { t } = useTranslation("common");
  const context: DriveRowContext = {
    spaceId,
    draggingNode,
    ...(canRename ? { canRename } : {}),
    ...(onDragEnd ? { onDragEnd } : {}),
    ...(onDragStart ? { onDragStart } : {}),
    ...(onMoveInto ? { onMoveInto } : {}),
    ...(onRename ? { onRename } : {}),
    ...(onSelect ? { onSelect } : {}),
    ...(renderRowActions ? { renderRowActions } : {}),
    ...(selectedArtifactId ? { selectedArtifactId } : {}),
    ...(selectedFileId ? { selectedFileId } : {}),
    ...(selectedFolderId ? { selectedFolderId } : {}),
    ...(selectedPath ? { selectedPath } : {}),
  };
  const sections = groupSpaceDataRootSections(nodes, {
    artifacts: t("spaces.data.artifactsSection", { defaultValue: "Artifacts" }),
  });
  return (
    <div className="flex flex-col gap-3">
      {unavailable.length > 0 ? (
        // Naming the missing source beats a shorter list that looks complete.
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          {t("spaces.data.partial", { sources: unavailable.join(", ") })}
        </p>
      ) : null}
      {isPending && nodes.length === 0 ? (
        <div className="flex items-center gap-2 p-3 text-muted-foreground text-sm">
          <Spinner className="size-4" />
          {t("spaces.data.loading")}
        </div>
      ) : (
        sections.map((section) => {
          const rootPath = section.root?.dataPath;
          const canCreate = Boolean(
            rootPath && capabilitiesByRoot[rootPath]?.canCreate && onAdd
          );
          const isArtifacts = section.id === ARTIFACTS_SECTION_ID;
          const href = isArtifacts
            ? spaceDataArtifactsPath(spaceKey)
            : section.root
              ? driveNodeHref(spaceKey, section.root)
              : null;
          const headingLabel = spaceDataSectionHeadingLabel(
            section,
            labelsByModuleId,
            t
          );
          const headingActive = isArtifacts
            ? selectedArtifactsRoot
            : Boolean(
                section.root?.dataPath &&
                  selectedPath &&
                  selectedPath === section.root.dataPath
              );
          const isFiles = section.root?.moduleId === "files";
          const addItems = isFiles
            ? filesAddItems
            : isArtifacts
              ? artifactsAddItems
              : canCreate && rootPath
                ? [
                    {
                      icon: <FolderPlus className="size-4" />,
                      id: "folder",
                      label: t("spaces.data.newFolder", {
                        defaultValue: "New folder",
                      }),
                      onSelect: () =>
                        onAdd?.({ kind: "folder", parentPath: rootPath }),
                    },
                  ]
                : [];
          return (
            <SpaceDataRootSection
              addDisabled={isAddBusy}
              addItems={addItems}
              addLabel={t("spaces.data.addInSection", {
                defaultValue: "Add",
              })}
              containsSelection={spaceDataSectionContainsSelection(section, {
                ...(selectedArtifactId ? { selectedArtifactId } : {}),
                ...(selectedArtifactsRoot ? { artifactsRoot: true } : {}),
                ...(selectedPath ? { selectedPath } : {}),
              })}
              headingActive={headingActive}
              key={section.id}
              label={headingLabel}
              sectionId={section.id}
              spaceKey={spaceKey}
              {...(href ? { to: href } : {})}
            >
              <RootSectionBody context={context} section={section} />
            </SpaceDataRootSection>
          );
        })
      )}
    </div>
  );
}

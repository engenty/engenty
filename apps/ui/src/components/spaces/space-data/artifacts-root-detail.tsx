/**
 * The Artifacts / Ablage root, listed like any other Data folder.
 *
 * There is no DriveNode for this section — artifacts nest by parent_id — so
 * the pane is a synthetic folder over the tree's Artifacts children.
 */
import { useTranslation } from "@engenty/i18n/ui";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { FOLDER_LIST_LATEST_DEFAULTS } from "@/components/spaces/space-data/folder-list-model";
import { FolderOverview } from "@/components/spaces/space-data/folder-overview";
import { PaneChrome } from "@/components/spaces/space-data/pane-chrome";
import {
  ARTIFACTS_SECTION_ID,
  groupSpaceDataRootSections,
} from "@/lib/space-data-root-sections";
import { driveNodeToListRow } from "@/lib/space-drive-href";
import { useSpaceDrive } from "@/lib/space-drive-queries";
import { spaceDataPath } from "@/lib/space-routes";

export function ArtifactsRootDetail({
  onClose,
  spaceId,
  spaceKey,
}: {
  onClose: () => void;
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const drive = useSpaceDrive(
    spaceId,
    t("spaces.data.projectsFolder", { defaultValue: "Projects" })
  );
  const sectionLabel = t("spaces.data.artifactsSection", {
    defaultValue: "Artifacts",
  });
  const children = useMemo(() => {
    const section = groupSpaceDataRootSections(drive.nodes, {
      artifacts: sectionLabel,
    }).find((entry) => entry.id === ARTIFACTS_SECTION_ID);
    return (section?.children ?? []).flatMap((node) => {
      const row = driveNodeToListRow(spaceKey, node);
      return row ? [row] : [];
    });
  }, [drive.nodes, sectionLabel, spaceKey]);

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [
      {
        label: t("spaces.tabs.data", { defaultValue: "Data" }),
        to: spaceDataPath(spaceKey),
      },
      { label: sectionLabel },
    ],
    [sectionLabel, spaceKey, t]
  );

  return (
    <PaneChrome breadcrumbs={breadcrumbs} onClose={onClose}>
      <FolderOverview
        defaults={FOLDER_LIST_LATEST_DEFAULTS}
        isPending={drive.isPending && children.length === 0}
        spaceId={spaceId}
        storageKey="space-data-artifacts"
      >
        {children}
      </FolderOverview>
    </PaneChrome>
  );
}

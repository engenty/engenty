/**
 * The Data tab's landing page: ways in, then the same admin list as a folder.
 *
 * Entry tiles are the tree's root sections — including Artifacts / Ablage,
 * which has no DriveNode of its own. Below them, Latest is an admin list of
 * those artifacts (search, sort, table or cards, paging), not a second table
 * shape. Recents still live on the space home; this page does not repeat them.
 */
import type { DriveNode } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import {
  cn,
  Spinner,
  uiCardRaisedClassName,
  uiPageScrollClassName,
} from "@engenty/ui-core";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import type { SpaceDataLibraryItemInput } from "@engenty/user-settings";
import { Folder } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { DRIVE_KIND_ICON } from "@/components/spaces/space-data/drive-kind-icon";
import {
  FOLDER_LIST_LATEST_DEFAULTS,
  type FolderChildRow,
} from "@/components/spaces/space-data/folder-list-model";
import { FolderOverview } from "@/components/spaces/space-data/folder-overview";
import { SpaceDataRootActions } from "@/components/spaces/space-data/root-actions";
import { useSpaceDataLibrary } from "@/lib/space-data-library-persistence";
import {
  ARTIFACTS_SECTION_ID,
  groupSpaceDataRootSections,
  type SpaceDataRootSection,
} from "@/lib/space-data-root-sections";
import { spaceDataSectionHeadingLabel } from "@/lib/space-data-section-label";
import { driveNodeHref, driveNodeToListRow } from "@/lib/space-drive-href";
import { useSpaceDrive } from "@/lib/space-drive-queries";
import { spaceDataArtifactsPath } from "@/lib/space-routes";
import { useSpaceModules } from "@/lib/use-space-modules";

export function SpaceDataDashboard({
  spaceId,
  spaceKey,
}: {
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const drive = useSpaceDrive(
    spaceId,
    t("spaces.data.projectsFolder", { defaultValue: "Projects" })
  );
  const library = useSpaceDataLibrary(spaceId);
  const { modules } = useSpaceModules(spaceId);
  const labelsByModuleId = useMemo(
    () => Object.fromEntries(modules.map((app) => [app.id, app.label])),
    [modules]
  );
  const artifactsLabel = t("spaces.data.artifactsSection", {
    defaultValue: "Artifacts",
  });

  const breadcrumbs = useMemo<PageBreadcrumb[]>(
    () => [{ label: t("spaces.tabs.data", { defaultValue: "Data" }) }],
    [t]
  );

  usePageConfig({
    actions: (
      <SpaceDataRootActions
        capabilitiesByRoot={drive.capabilitiesByRoot}
        spaceId={spaceId}
      />
    ),
    breadcrumbs,
    contentStackBackground: "paper",
  });

  const sections = useMemo(
    () =>
      groupSpaceDataRootSections(drive.nodes, { artifacts: artifactsLabel }),
    [artifactsLabel, drive.nodes]
  );

  const artifactRows = useMemo<FolderChildRow[]>(() => {
    const artifacts =
      sections.find((section) => section.id === ARTIFACTS_SECTION_ID)
        ?.children ?? [];
    return artifacts.flatMap((node) => {
      const row = driveNodeToListRow(spaceKey, node);
      return row ? [row] : [];
    });
  }, [sections, spaceKey]);

  return (
    <div className={uiPageScrollClassName}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-page">
        <section className="space-y-2">
          {drive.isPending && drive.nodes.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner className="size-4" />
              {t("spaces.data.loading")}
            </div>
          ) : sections.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("spaces.data.empty")}
            </p>
          ) : (
            <nav
              aria-label={t("spaces.data.inThisSpace", {
                defaultValue: "In this space",
              })}
              className="grid grid-cols-2 gap-2.5 md:grid-cols-4"
            >
              {sections.map((section) => (
                <SectionTile
                  key={section.id}
                  labelsByModuleId={labelsByModuleId}
                  onOpen={library.touchRecent}
                  section={section}
                  spaceId={spaceId}
                  spaceKey={spaceKey}
                />
              ))}
            </nav>
          )}
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t("spaces.data.mountNote", {
              defaultValue:
                "Module folders are mounted records. Files and artifacts are deliverables; task workspace files remain with the task unless copied or published.",
            })}
          </p>
        </section>

        {drive.isPending || artifactRows.length > 0 ? (
          <FolderOverview
            defaults={FOLDER_LIST_LATEST_DEFAULTS}
            isPending={drive.isPending && artifactRows.length === 0}
            layout="plain"
            spaceId={spaceId}
            storageKey="space-data-dashboard"
          >
            {artifactRows}
          </FolderOverview>
        ) : null}
      </div>
    </div>
  );
}

function SectionTile({
  labelsByModuleId,
  onOpen,
  section,
  spaceId,
  spaceKey,
}: {
  labelsByModuleId: Record<string, string>;
  onOpen: (item: SpaceDataLibraryItemInput) => void;
  section: SpaceDataRootSection;
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const label = spaceDataSectionHeadingLabel(section, labelsByModuleId, t);
  const href =
    section.id === ARTIFACTS_SECTION_ID
      ? spaceDataArtifactsPath(spaceKey)
      : section.root
        ? driveNodeHref(spaceKey, section.root)
        : null;
  const Icon =
    section.id === ARTIFACTS_SECTION_ID
      ? Folder
      : section.root
        ? DRIVE_KIND_ICON[section.root.kind]
        : Folder;
  const pin =
    spaceId && href
      ? libraryItemForSection({
          href,
          root: section.root,
          spaceId,
          title: label,
        })
      : null;
  const shape = cn(
    uiCardRaisedClassName,
    "group flex min-w-0 items-center gap-2 px-3.5 py-3 font-semibold text-sm"
  );
  const body = (
    <>
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate group-hover:underline">{label}</span>
    </>
  );

  if (!href) {
    return <div className={shape}>{body}</div>;
  }
  return (
    <Link
      className={shape}
      onClick={() => {
        if (pin) {
          onOpen(pin);
        }
      }}
      to={href}
    >
      {body}
    </Link>
  );
}

function libraryItemForSection({
  href,
  root,
  spaceId,
  title,
}: {
  href: string;
  root: DriveNode | null;
  spaceId: string;
  title: string;
}): SpaceDataLibraryItemInput {
  return {
    href,
    kind: root?.kind ?? "folder",
    space_id: spaceId,
    title,
  };
}

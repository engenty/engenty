/**
 * Topbar trail for a space artifact: Artifacts / …folders… / title.
 *
 * Contacts already names its root in the data path. Artifacts have no path —
 * they nest by `parent_id` — so the section label has to be inserted here.
 * Data is first so the shell can replace it with the module icon; Artifacts
 * stays visible as the next crumb (`Artifacts / Aktien`, not `/ Aktien`).
 */
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import type { PageBreadcrumb } from "@engenty/ui-plugin-sdk";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { getSpaceArtifacts } from "@/lib/api/space-drive-client";
import { buildArtifactBreadcrumbs } from "@/lib/artifact-tree";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import {
  spaceDataArtifactPath,
  spaceDataArtifactsPath,
  spaceDataPath,
} from "@/lib/space-routes";
import { NO_BREADCRUMBS } from "./pane-chrome";

export function useArtifactBreadcrumbs(
  artifact: { id: string; title: string } | null,
  spaceId: string | null | undefined
): PageBreadcrumb[] {
  const { t } = useTranslation("common");
  const { spaceKey = "" } = useParams();
  const artifactsQuery = useQuery({
    enabled: Boolean(spaceId),
    queryFn: ({ signal }) => getSpaceArtifacts(spaceId ?? "", signal),
    queryKey: spaceDriveKeys.artifacts(spaceId ?? ""),
  });
  const dataLabel = t("spaces.tabs.data", { defaultValue: "Data" });
  const sectionLabel = t("spaces.data.artifactsSection", {
    defaultValue: "Artifacts",
  });
  const hubHref = spaceDataPath(spaceKey);
  const sectionHref = spaceDataArtifactsPath(spaceKey);

  return useMemo(() => {
    if (!artifact) {
      return NO_BREADCRUMBS;
    }
    return buildArtifactBreadcrumbs({
      artifactId: artifact.id,
      hrefFor: (id) => spaceDataArtifactPath(spaceKey, id),
      rows: artifactsQuery.data ?? [],
      rootHref: hubHref,
      rootLabel: dataLabel,
      sectionHref,
      sectionLabel,
      title: artifact.title,
    });
  }, [
    artifact,
    artifactsQuery.data,
    dataLabel,
    hubHref,
    sectionHref,
    sectionLabel,
    spaceKey,
  ]);
}

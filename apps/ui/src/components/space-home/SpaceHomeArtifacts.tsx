/**
 * The home's right column, top half (PLAN-space-home.md H7).
 *
 * The artifacts this person pinned in the space — the same list as the Work
 * sidebar. Everything else lives in Data; pinning does not change ownership.
 */
import { formatRelativeDate, iconForArtifactType } from "@engenty/ai-ui";
import type { SpaceDriveArtifact } from "@engenty/file-storage";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { pinnedArtifactsInOrder } from "@engenty/user-settings";
import { Link } from "react-router-dom";
import { getSpaceArtifacts } from "@/lib/api/space-drive-client";
import { useSpaceArtifactPins } from "@/lib/space-artifact-pins-persistence";
import { useSpaceDataReturnState } from "@/lib/space-data-return";
import { spaceDriveKeys } from "@/lib/space-drive-queries";
import { spaceDataArtifactPath, spaceDataPath } from "@/lib/space-routes";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";

const SHOWN = 6;

export function selectPinnedSpaceArtifacts(
  artifacts: readonly SpaceDriveArtifact[],
  pinnedIds: readonly string[]
): SpaceDriveArtifact[] {
  return pinnedArtifactsInOrder(artifacts, pinnedIds);
}

export function SpaceHomeArtifacts({
  spaceId,
  spaceKey,
}: {
  spaceId: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const returnState = useSpaceDataReturnState();
  const artifactsQuery = useQuery({
    queryFn: ({ signal }) => getSpaceArtifacts(spaceId, signal),
    queryKey: spaceDriveKeys.artifacts(spaceId),
  });
  const knownIds = artifactsQuery.data?.map((artifact) => artifact.id);
  const pins = useSpaceArtifactPins(spaceId, knownIds);
  const rows = selectPinnedSpaceArtifacts(
    artifactsQuery.data ?? [],
    pins.pinned
  );
  const total = artifactsQuery.data?.length ?? 0;

  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col">
      <SpaceHomeSectionHeading>
        {t("spaces.home.artifacts.title", { defaultValue: "Artifacts" })}
      </SpaceHomeSectionHeading>
      <div className="ui-card-raised flex flex-col rounded-[14px] px-1.5 py-1">
        {rows.slice(0, SHOWN).map((artifact) => {
          const Icon = iconForArtifactType(artifact.type ?? "markdown");
          return (
            <Link
              className="flex items-start gap-2.5 rounded-[10px] px-2 py-2 hover:bg-accent/60"
              key={artifact.id}
              state={returnState}
              to={spaceDataArtifactPath(spaceKey, artifact.id)}
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-muted text-muted-foreground">
                <Icon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate font-medium text-[13px]">
                  {artifact.title}
                </span>
                {artifact.updatedAt ? (
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                    {t("spaces.home.artifacts.line", {
                      defaultValue: "{{when}}",
                      when: formatRelativeDate(artifact.updatedAt),
                    })}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
        <Link
          className="px-2 py-2 font-medium text-[12px] text-link hover:underline"
          to={spaceDataPath(spaceKey)}
        >
          {t("spaces.home.artifacts.all", {
            count: total,
            defaultValue: "All {{count}} artifacts",
          })}
        </Link>
      </div>
    </section>
  );
}

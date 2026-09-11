/**
 * Reachability follows the mount.
 *
 * Every module route is mirrored into every space (`space-route-mirrors.ts`),
 * because mirroring only the mounted ones would mean re-registering routes per
 * space. That left `/s/<key>/tasks` rendering in a space that never mounted
 * Tasks — a page whose module the space does not have, where a person could
 * create work the space's own sidebar would never show.
 *
 * This wraps each mirrored page and asks the space's SURFACE — the same answer
 * the Work list reads — whether the module is here. A module the setup catalog
 * does not offer (commercial settings, a provider plugin) is passed through:
 * those were never a mount decision and the catalog is what says so.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Spinner,
} from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Boxes } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { spaceRootPath, spaceSettingsPath } from "@/lib/space-routes";
import {
  useSpaceSetupCatalogQuery,
  useSpaceSurfaceQuery,
  useSpacesQuery,
} from "@/lib/spaces-queries";

export function SpaceModuleGate({
  children,
  moduleId,
}: {
  children: ReactNode;
  moduleId: string;
}) {
  const { t } = useTranslation("common");
  const { spaceKey = "" } = useParams();
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const spacesQuery = useSpacesQuery();
  const space = useMemo(
    () => spacesQuery.data?.find((entry) => entry.key === spaceKey) ?? null,
    [spaceKey, spacesQuery.data]
  );
  const catalogQuery = useSpaceSetupCatalogQuery();
  const surfaceQuery = useSpaceSurfaceQuery(space?.id ?? null);

  const mountable = useMemo(
    () => new Set((catalogQuery.data?.modules ?? []).map((m) => m.id)),
    [catalogQuery.data?.modules]
  );
  const moduleName =
    catalogQuery.data?.modules.find((m) => m.id === moduleId)?.name ?? moduleId;

  // An unknown space key falls through to the page: the module reads the
  // fallback space itself, and a gate that hid every page behind a bad key
  // would hide the shell's own "not found" handling with it.
  if (!space || (catalogQuery.data && !mountable.has(moduleId))) {
    return <>{children}</>;
  }
  if (catalogQuery.isPending || surfaceQuery.isPending) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Spinner className="size-5" />
      </div>
    );
  }
  const mounted =
    surfaceQuery.data?.modules.some((entry) => entry.moduleId === moduleId) ??
    // A failed surface read must not lock a page the space may well have.
    true;
  if (mounted) {
    return <>{children}</>;
  }
  // Admins mount modules; so does the owner of a personal space.
  const canEdit = Boolean(isTenantAdmin || isSuperAdmin || space.ownerUserId);
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Boxes className="size-10" />
          </EmptyMedia>
          <EmptyTitle>
            {t("spaces.moduleNotMounted.title", {
              defaultValue: "{{module}} is not in this space",
              module: moduleName,
            })}
          </EmptyTitle>
          <EmptyDescription>
            {t("spaces.moduleNotMounted.description", {
              defaultValue:
                "This space does not have this module. Add it in the space settings to use it here.",
            })}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to={spaceRootPath(space.key)}>
                {t("spaces.moduleNotMounted.back", {
                  defaultValue: "Back to the space",
                })}
              </Link>
            </Button>
            {canEdit ? (
              <Button asChild size="sm">
                <Link to={spaceSettingsPath(space.key)}>
                  {t("spaces.moduleNotMounted.action", {
                    defaultValue: "Add {{module}}",
                    module: moduleName,
                  })}
                </Link>
              </Button>
            ) : null}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}

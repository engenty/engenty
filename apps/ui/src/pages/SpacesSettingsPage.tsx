/**
 * Spaces admin surface (PLAN-spaces.md Phase 3b).
 *
 * A list plus the setup dialog. It lives in Settings for now because Phase 5
 * has not built the rail's spaces zone yet — when it does, "New space" moves
 * there and this page stays as the place where an existing space is edited.
 */
import { useSetupSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, Spinner } from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { Boxes, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SpaceSetupDialog } from "@/components/spaces/SpaceSetupDialog";
import type { Space } from "@/lib/api/spaces-client";
import { spaceSettingsPath } from "@/lib/space-routes";
import { useRestoreSpaceMutation, useSpacesQuery } from "@/lib/spaces-queries";

function SpaceRow({ space }: { space: Space }) {
  const { t } = useTranslation("common");
  const restore = useRestoreSpaceMutation();
  const pending = Boolean(space.deletedAt);
  const purgeLabel = space.purgeAfter
    ? new Date(space.purgeAfter).toLocaleDateString(undefined, {
        dateStyle: "medium",
      })
    : "";
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <Boxes className="size-4 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {pending ? (
            <span className="truncate font-medium text-sm">{space.name}</span>
          ) : (
            <Link
              className="truncate font-medium text-sm hover:underline"
              to={spaceSettingsPath(space.key)}
            >
              {space.name}
            </Link>
          )}
          {space.isDefault ? (
            <Badge variant="secondary">{t("spaces.defaultBadge")}</Badge>
          ) : null}
          {pending ? (
            <Badge variant="secondary">
              {t("spaces.pendingDeletionBadge")}
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-muted-foreground text-xs">
          /{space.key}
          {pending && purgeLabel
            ? ` · ${t("spaces.pendingDeletionUntil", { date: purgeLabel })}`
            : ""}
        </p>
      </div>
      {pending ? (
        <Button
          disabled={restore.isPending}
          onClick={() => restore.mutate(space.id)}
          size="sm"
          variant="outline"
        >
          {t("spaces.restoreAction")}
        </Button>
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link to={spaceSettingsPath(space.key)}>
            {t("spaces.editAction")}
          </Link>
        </Button>
      )}
    </div>
  );
}

export function SpacesSettingsPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } = useSetupSecondaryShellNav(
    t("navigation.setup")
  );
  const { isTenantAdmin, isSuperAdmin } = useWorkspaceContext();
  const canManage = Boolean(isTenantAdmin || isSuperAdmin);
  const spacesQuery = useSpacesQuery({ includeDeleted: canManage });
  const [dialogOpen, setDialogOpen] = useState(false);

  const pageActions = useMemo(
    () =>
      canManage ? (
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="mr-1.5 size-3.5" />
          {t("spaces.newAction")}
        </Button>
      ) : null,
    [canManage, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs: [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("spaces.title") },
    ],
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
  });

  const spaces = spacesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("spaces.description")}</p>
      {canManage ? null : (
        // The same rule the API and the database enforce, said once on screen
        // so a member is not left clicking a button that always 403s.
        <p className="text-muted-foreground text-xs">
          {t("spaces.adminOnlyNotice")}
        </p>
      )}
      <div className="ui-card-panel overflow-hidden">
        {spacesQuery.isPending ? (
          <div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
            <Spinner className="size-4" />
            {t("spaces.loading")}
          </div>
        ) : spaces.length === 0 ? (
          <p className="p-4 text-muted-foreground text-sm">
            {t("spaces.empty")}
          </p>
        ) : (
          spaces.map((space) => <SpaceRow key={space.id} space={space} />)
        )}
      </div>
      {canManage ? (
        <SpaceSetupDialog onOpenChange={setDialogOpen} open={dialogOpen} />
      ) : null}
    </div>
  );
}

/**
 * Space settings → Erweiterungen: every account this Space owns (who
 * connected it, its status) and every plugin enabled here that still needs
 * one. A row opens that connector in the Erweiterungen dialog, where owners
 * manage the account; any member may connect one.
 */
import { connectionsCatalogOptions } from "@engenty/connections/ui/queries";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { cn, SettingsFormSection, Skeleton } from "@engenty/ui-core";
import { ChevronRight, Plug, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { SettingsOverviewIcon } from "@/components/settings";
import { SpaceExtensionsDialog } from "@/components/space-home/SpaceExtensionsDialog";
import {
  selectSpaceHomeExtensionRows,
  spaceExtensionAccounts,
} from "@/lib/space-home-extensions";
import {
  useSpaceMembersQuery,
  useSpaceMountsQuery,
} from "@/lib/spaces-queries";

export const SPACE_SETTINGS_EXTENSIONS_HASH = "extensions";

export function SpaceExtensionsSection({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation("common");
  const { t: tc } = useTranslation("connections");
  const [dialog, setDialog] = useState<{ detailsId: string | null } | null>(
    null
  );
  const catalogQuery = useQuery(connectionsCatalogOptions(spaceId));
  const mountsQuery = useSpaceMountsQuery(spaceId);
  const membersQuery = useSpaceMembersQuery(spaceId);
  const memberNames = useMemo(
    () =>
      new Map(
        (membersQuery.data ?? []).map((member) => [
          member.userId,
          member.displayName ?? member.email ?? null,
        ])
      ),
    [membersQuery.data]
  );
  const rows = useMemo(() => {
    const connectors = catalogQuery.data?.connectors ?? [];
    return selectSpaceHomeExtensionRows(
      mountsQuery.data ?? [],
      spaceExtensionAccounts(connectors, spaceId),
      {
        plugins: new Map(
          connectors.map((connector) => [connector.id, connector.name])
        ),
      }
    );
  }, [catalogQuery.data, mountsQuery.data, spaceId]);
  const pending = catalogQuery.isPending || mountsQuery.isPending;

  return (
    <div id={SPACE_SETTINGS_EXTENSIONS_HASH}>
      <SettingsFormSection
        cardVariant="flush"
        description={t("spaces.settings.extensionsHint")}
        title={t("spaces.home.extensions.title")}
      >
        {pending ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted-foreground text-sm">
            {t("spaces.home.extensions.empty")}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => {
              const connectedBy = row.connectedBy
                ? (memberNames.get(row.connectedBy) ?? null)
                : null;
              const detail =
                row.kind === "connection"
                  ? [
                      row.connectorName === row.label
                        ? null
                        : row.connectorName,
                      connectedBy
                        ? t("spaces.settings.connectedBy", {
                            name: connectedBy,
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : null;
              return (
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  key={`${row.kind}:${row.id}`}
                  onClick={() => setDialog({ detailsId: row.connectorId })}
                  type="button"
                >
                  <SettingsOverviewIcon Icon={Plug} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-foreground text-sm">
                      {row.label}
                    </span>
                    {detail ? (
                      <span className="truncate text-muted-foreground text-xs">
                        {detail}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      row.status === "active" && "text-muted-foreground",
                      row.status === "pending" &&
                        "text-amber-600 dark:text-amber-500",
                      (row.status === "error" || row.status === "revoked") &&
                        "text-destructive"
                    )}
                  >
                    {row.status === "pending"
                      ? tc("marketplace.needsAuth")
                      : tc(`status.${row.status}`)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />
                </button>
              );
            })}
          </div>
        )}
        <button
          className="flex w-full items-center justify-center gap-2 border-border border-t px-4 py-3 font-semibold text-primary text-xs transition-colors hover:bg-primary/5"
          onClick={() => setDialog({ detailsId: null })}
          type="button"
        >
          <Plus className="size-3" />
          {t("spaces.settings.connectAccount")}
        </button>
      </SettingsFormSection>
      <SpaceExtensionsDialog
        initialDetailsId={dialog?.detailsId ?? null}
        onOpenChange={(next) => {
          if (!next) {
            setDialog(null);
          }
        }}
        open={dialog != null}
        spaceId={spaceId}
      />
    </div>
  );
}

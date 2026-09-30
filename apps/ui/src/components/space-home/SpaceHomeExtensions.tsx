/**
 * The home's right column, below Modules: the accounts and plugins this space
 * uses (its skills have their own box, SpaceHomeSkills). A row opens that
 * connector in the Erweiterungen dialog — the same one Space settings opens.
 */
import { connectionsCatalogOptions } from "@engenty/connections/ui/queries";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Collapsible, CollapsibleContent, cn } from "@engenty/ui-core";
import { Plug } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SpaceSectionAddButton } from "@/components/spaces/space-section-heading";
import {
  SPACE_HOME_EXTENSIONS_SHOWN,
  selectSpaceHomeExtensionRows,
  spaceExtensionAccounts,
} from "@/lib/space-home-extensions";
import { spaceSettingsPath } from "@/lib/space-routes";
import { useSpaceMountsQuery } from "@/lib/spaces-queries";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";
import { SpaceExtensionsDialog } from "./SpaceExtensionsDialog";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";
import {
  SPACE_HOME_ROW_CLASSNAME,
  SPACE_HOME_ROW_GLYPH_CLASSNAME,
  SPACE_HOME_ROW_ICON_CLASSNAME,
} from "./space-home-row";

export function SpaceHomeExtensions({
  spaceId,
  spaceKey,
}: {
  spaceId: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const { t: tc } = useTranslation("connections");
  // Open, and on which connector (null = the list).
  const [dialog, setDialog] = useState<{ detailsId: string | null } | null>(
    null
  );
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.homeExtensions,
    spaceKey
  );
  const mountsQuery = useSpaceMountsQuery(open ? spaceId : null);
  const catalogQuery = useQuery({
    ...connectionsCatalogOptions(spaceId),
    enabled: open,
  });
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
  const shown = rows.slice(0, SPACE_HOME_EXTENSIONS_SHOWN);
  const addLabel = t("spaces.home.extensions.add", {
    defaultValue: "Connect",
  });

  const openConnect = (detailsId: string | null = null) =>
    setDialog({ detailsId });

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceHomeSectionHeading
        action={
          <SpaceSectionAddButton
            aria-label={addLabel}
            onClick={() => openConnect()}
          />
        }
        onOpenChange={setOpen}
        open={open}
      >
        {t("spaces.home.extensions.title", { defaultValue: "Extensions" })}
      </SpaceHomeSectionHeading>
      <CollapsibleContent>
        <div className="ui-card-raised flex flex-col rounded-[14px] px-1.5 py-1">
          {rows.length === 0 ? (
            <p className="px-2 py-2 text-muted-foreground text-sm">
              {t("spaces.home.extensions.empty", {
                defaultValue: "Nothing is connected in this space yet.",
              })}
            </p>
          ) : (
            shown.map((row) => {
              const attention = row.status !== "active";
              return (
                <button
                  className={SPACE_HOME_ROW_CLASSNAME}
                  key={`${row.kind}:${row.id}`}
                  onClick={() => openConnect(row.connectorId)}
                  type="button"
                >
                  <span aria-hidden className={SPACE_HOME_ROW_ICON_CLASSNAME}>
                    <Plug className={SPACE_HOME_ROW_GLYPH_CLASSNAME} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{row.label}</span>
                    {attention ? (
                      <span
                        className={cn(
                          "block truncate text-xs",
                          row.status === "pending"
                            ? "text-amber-600 dark:text-amber-500"
                            : "text-destructive"
                        )}
                      >
                        {row.status === "pending"
                          ? tc("marketplace.needsAuth")
                          : tc(`status.${row.status}`)}
                      </span>
                    ) : row.connectorName && row.connectorName !== row.label ? (
                      <span className="block truncate text-muted-foreground text-xs">
                        {row.connectorName}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
          <button
            className="px-2 py-2 text-left font-medium text-[12px] text-primary hover:underline"
            onClick={() => openConnect()}
            type="button"
          >
            {t("spaces.home.extensions.connect", { defaultValue: "Connect" })}
          </button>
          {rows.length > SPACE_HOME_EXTENSIONS_SHOWN ? (
            <Link
              className="px-2 py-2 font-medium text-[12px] text-primary hover:underline"
              to={`${spaceSettingsPath(spaceKey)}#extensions`}
            >
              {t("spaces.home.extensions.all", { defaultValue: "All" })}
            </Link>
          ) : null}
        </div>
      </CollapsibleContent>
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
    </Collapsible>
  );
}

/**
 * The home's right column, below Module: extra capabilities this Space
 * actually uses. Slice 1 is mounted accounts (CN.3) — skills and MCP stay
 * out until they have a distinct extra set to show.
 *
 * Empty on purpose: most Spaces have no account mounted yet, and connecting
 * the first one is the point of the empty state. Heading chrome matches the
 * Work sidebar: hover reveals a chevron and a "+" that adds an account.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Collapsible, CollapsibleContent } from "@engenty/ui-core";
import { Plug, Plus } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { connectionMetaById } from "@/components/spaces/space-mount-catalog";
import { SpaceSectionAddButton } from "@/components/spaces/space-section-heading";
import {
  SPACE_HOME_EXTENSIONS_SHOWN,
  selectSpaceHomeExtensionRows,
  spaceAddAccountPath,
} from "@/lib/space-home-extensions";
import { spaceRootPath, spaceSettingsPath } from "@/lib/space-routes";
import {
  useSpaceConnectorCatalogQuery,
  useSpaceMountsQuery,
} from "@/lib/spaces-queries";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";

export function SpaceHomeExtensions({
  spaceId,
  spaceKey,
}: {
  spaceId: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const mountsQuery = useSpaceMountsQuery(spaceId);
  const connectorsQuery = useSpaceConnectorCatalogQuery();
  const metaById = useMemo(
    () => connectionMetaById(connectorsQuery.data ?? []),
    [connectorsQuery.data]
  );
  const rows = useMemo(
    () => selectSpaceHomeExtensionRows(mountsQuery.data ?? [], metaById),
    [metaById, mountsQuery.data]
  );
  const homePath = spaceRootPath(spaceKey);
  const shown = rows.slice(0, SPACE_HOME_EXTENSIONS_SHOWN);
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.homeExtensions,
    spaceKey
  );
  const addLabel = t("spaces.home.extensions.add", {
    defaultValue: "Add an account",
  });

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceHomeSectionHeading
        action={
          <SpaceSectionAddButton aria-label={addLabel} asChild>
            <Link to={spaceAddAccountPath(spaceId, homePath)}>
              <Plus aria-hidden className="size-3.5" />
            </Link>
          </SpaceSectionAddButton>
        }
        onOpenChange={setOpen}
        open={open}
      >
        {t("spaces.home.extensions.title", { defaultValue: "Extensions" })}
      </SpaceHomeSectionHeading>
      <CollapsibleContent>
        <div className="ui-card-raised flex flex-col rounded-[14px] px-1.5 py-1">
          {rows.length === 0 ? (
            <p className="px-2 py-2 text-[12.5px] text-muted-foreground">
              {t("spaces.home.extensions.empty", {
                defaultValue: "No extra account is mounted in this space yet.",
              })}
            </p>
          ) : (
            shown.map((row) => (
              <Link
                className="flex items-start gap-2.5 rounded-[10px] px-2 py-2 hover:bg-accent/60"
                key={row.id}
                to={
                  row.connectorId
                    ? spaceAddAccountPath(spaceId, homePath, row.connectorId)
                    : spaceSettingsPath(spaceKey)
                }
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-muted text-muted-foreground">
                  <Plug className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[13px]">
                    {row.label}
                  </span>
                  {row.connectorName && row.connectorName !== row.label ? (
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                      {row.connectorName}
                    </span>
                  ) : null}
                </span>
              </Link>
            ))
          )}
          {rows.length > SPACE_HOME_EXTENSIONS_SHOWN ? (
            <Link
              className="px-2 py-2 font-medium text-[12px] text-primary hover:underline"
              to={spaceSettingsPath(spaceKey)}
            >
              {t("spaces.home.extensions.all", { defaultValue: "All" })}
            </Link>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

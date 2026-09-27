/**
 * The home's right column, below Modules: plugins and accounts this space
 * actually uses (its skills have their own box, SpaceHomeSkills). Connect
 * opens one modal — the same marketplace a space settings card uses.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Collapsible, CollapsibleContent } from "@engenty/ui-core";
import { Plug } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { spaceAccounts } from "@/components/spaces/space-mount-catalog";
import { pluginsFromConnectors } from "@/components/spaces/space-plugin-catalog";
import { SpaceSectionAddButton } from "@/components/spaces/space-section-heading";
import {
  SPACE_HOME_EXTENSIONS_SHOWN,
  selectSpaceHomeExtensionRows,
} from "@/lib/space-home-extensions";
import { spaceSettingsPath } from "@/lib/space-routes";
import {
  useSpaceConnectorCatalogQuery,
  useSpaceMountsQuery,
} from "@/lib/spaces-queries";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";
import { SpaceHomeConnectDialog } from "./SpaceHomeConnectDialog";
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
  const [connectOpen, setConnectOpen] = useState(false);
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.homeExtensions,
    spaceKey
  );
  const mountsQuery = useSpaceMountsQuery(open ? spaceId : null);
  const connectorsQuery = useSpaceConnectorCatalogQuery();
  const accounts = useMemo(
    () => spaceAccounts(connectorsQuery.data ?? [], spaceId),
    [connectorsQuery.data, spaceId]
  );
  const pluginNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const plugin of pluginsFromConnectors(
      connectorsQuery.data ?? [],
      mountsQuery.data ?? []
    )) {
      names.set(plugin.id, plugin.name);
    }
    return names;
  }, [connectorsQuery.data, mountsQuery.data]);
  const rows = useMemo(
    () =>
      selectSpaceHomeExtensionRows(mountsQuery.data ?? [], accounts, {
        plugins: pluginNames,
      }),
    [accounts, mountsQuery.data, pluginNames]
  );
  const shown = rows.slice(0, SPACE_HOME_EXTENSIONS_SHOWN);
  const addLabel = t("spaces.home.extensions.add", {
    defaultValue: "Connect",
  });

  const openConnect = () => setConnectOpen(true);

  return (
    <Collapsible
      className="group/section flex flex-col"
      onOpenChange={setOpen}
      open={open}
    >
      <SpaceHomeSectionHeading
        action={
          <SpaceSectionAddButton aria-label={addLabel} onClick={openConnect} />
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
            shown.map((row) => (
              <button
                className={SPACE_HOME_ROW_CLASSNAME}
                key={`${row.kind}:${row.id}`}
                onClick={openConnect}
                type="button"
              >
                <span aria-hidden className={SPACE_HOME_ROW_ICON_CLASSNAME}>
                  <Plug className={SPACE_HOME_ROW_GLYPH_CLASSNAME} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{row.label}</span>
                  {row.connectorName && row.connectorName !== row.label ? (
                    <span className="block truncate text-muted-foreground text-xs">
                      {row.connectorName}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          )}
          <button
            className="px-2 py-2 text-left font-medium text-[12px] text-primary hover:underline"
            onClick={openConnect}
            type="button"
          >
            {t("spaces.home.extensions.connect", { defaultValue: "Connect" })}
          </button>
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
      <SpaceHomeConnectDialog
        initialTab="plugins"
        onOpenChange={setConnectOpen}
        open={connectOpen}
        spaceId={spaceId}
      />
    </Collapsible>
  );
}

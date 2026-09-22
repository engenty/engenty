/**
 * The home's right column, below Modules: plugins, accounts, and skills
 * this space actually uses. Connect opens one modal — the same marketplace
 * a space settings card uses, plus the skill mounts.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Collapsible, CollapsibleContent } from "@engenty/ui-core";
import { Plug, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { connectionMetaById } from "@/components/spaces/space-mount-catalog";
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
  useSpaceSkillCatalogQuery,
} from "@/lib/spaces-queries";
import {
  SPACE_SECTION_OPEN_KEYS,
  useSpaceSectionOpen,
} from "@/lib/use-space-section-open";
import {
  type SpaceConnectTab,
  SpaceHomeConnectDialog,
} from "./SpaceHomeConnectDialog";
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
  const skillsQuery = useSpaceSkillCatalogQuery();
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectTab, setConnectTab] = useState<SpaceConnectTab>("plugins");
  const metaById = useMemo(
    () => connectionMetaById(connectorsQuery.data ?? []),
    [connectorsQuery.data]
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
  const skillNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const skill of skillsQuery.data ?? []) {
      names.set(skill.name, skill.title?.trim() || skill.name);
    }
    return names;
  }, [skillsQuery.data]);
  const rows = useMemo(
    () =>
      selectSpaceHomeExtensionRows(mountsQuery.data ?? [], metaById, {
        plugins: pluginNames,
        skills: skillNames,
      }),
    [metaById, mountsQuery.data, pluginNames, skillNames]
  );
  const shown = rows.slice(0, SPACE_HOME_EXTENSIONS_SHOWN);
  const [open, setOpen] = useSpaceSectionOpen(
    SPACE_SECTION_OPEN_KEYS.homeExtensions,
    spaceKey
  );
  const addLabel = t("spaces.home.extensions.add", {
    defaultValue: "Connect",
  });

  const openConnect = (tab: SpaceConnectTab) => {
    setConnectTab(tab);
    setConnectOpen(true);
  };

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
            onClick={() => openConnect("plugins")}
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
            <p className="px-2 py-2 text-[12.5px] text-muted-foreground">
              {t("spaces.home.extensions.empty", {
                defaultValue: "Nothing is connected in this space yet.",
              })}
            </p>
          ) : (
            shown.map((row) => (
              <button
                className="flex items-start gap-2.5 rounded-[10px] px-2 py-2 text-left hover:bg-accent/60"
                key={`${row.kind}:${row.id}`}
                onClick={() =>
                  openConnect(row.kind === "skill" ? "skills" : "plugins")
                }
                type="button"
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-muted text-muted-foreground">
                  {row.kind === "skill" ? (
                    <Sparkles className="size-3.5" />
                  ) : (
                    <Plug className="size-3.5" />
                  )}
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
              </button>
            ))
          )}
          <button
            className="px-2 py-2 text-left font-medium text-[12px] text-primary hover:underline"
            onClick={() => openConnect("plugins")}
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
        initialTab={connectTab}
        onOpenChange={setConnectOpen}
        open={connectOpen}
        spaceId={spaceId}
      />
    </Collapsible>
  );
}

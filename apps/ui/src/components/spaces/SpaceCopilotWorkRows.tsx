/**
 * Copilot as a Work-list row: a door into its module sidebar, same as every
 * other mount. Its thread list does not live here — mixing those chats into
 * the space column is what drilling in exists to avoid.
 */
import { localizeCopilotChatPath } from "@engenty/engenty-copilot/paths";
import { useTranslation } from "@engenty/i18n/ui";
import { DockChatIcon } from "@engenty/ui-icons";
import type { UiCopilotAppContribution } from "@engenty/ui-plugin-sdk";
import { SpaceNavRow } from "@/components/spaces/space-nav-row";
import { spaceRootPath } from "@/lib/space-routes";

export function SpaceCopilotWorkRows({
  activeModuleId,
  apps,
  spaceKey,
}: {
  activeModuleId: string | undefined;
  apps: readonly UiCopilotAppContribution[];
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  return (
    <>
      {apps.map((app) => {
        const href = localizeCopilotChatPath(app.to, spaceRootPath(spaceKey));
        return (
          <SpaceNavRow
            active={activeModuleId === app.pluginId}
            href={href}
            icon={app.icon ?? DockChatIcon}
            key={app.id}
            label={
              app.labelKey
                ? t(app.labelKey, { defaultValue: app.label })
                : app.label
            }
          />
        );
      })}
    </>
  );
}

/**
 * Copilot as a Work-list row: a door into its module sidebar, same as every
 * other mount. Its thread list does not live here — mixing those chats into
 * the space column is what drilling in exists to avoid.
 *
 * It sits at the top of the list and reads like the desks under it — the
 * same row anatomy as `SpaceAgentNavRow` (a 40px face, the name beside it)
 * with the copilot's own ember blob for a face, not a dock icon: the copilot
 * is someone you talk to, and the list is a list of those.
 */
import { localizeCopilotChatPath } from "@engenty/engenty-copilot/paths";
import { useTranslation } from "@engenty/i18n/ui";
import { BlobAvatar, cn } from "@engenty/ui-core";
import type { UiCopilotAppContribution } from "@engenty/ui-plugin-sdk";
import { Link } from "react-router-dom";
import { spaceRootPath } from "@/lib/space-routes";

function SpaceCopilotNavRow({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        // The desk rows' own metrics (`SpaceAgentNavRow`): pl-1 so the blob
        // shares the engenties' left edge, size-10 face slot, one 8px radius.
        "flex items-center gap-2 rounded-[8px] py-1 pr-2 pl-1 text-foreground text-sm",
        "transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        active ? "bg-muted font-semibold" : "hover:bg-muted/60"
      )}
      data-testid="space-copilot-row"
      to={href}
    >
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center overflow-visible"
      >
        {/* The FAB's blob (48×56) scaled into the desks' 38px face slot;
            its floor shadow is the dock's, not a list row's. */}
        <BlobAvatar
          character="ember"
          className="scale-[0.68] [&_.blob-shadow]:hidden"
          state={active ? "thinking" : "idle"}
        />
      </span>
      <span className="min-w-0 flex-1 truncate leading-snug" title={label}>
        {label}
      </span>
    </Link>
  );
}

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
    <div className="flex flex-col">
      {apps.map((app) => (
        <SpaceCopilotNavRow
          active={activeModuleId === app.pluginId}
          href={localizeCopilotChatPath(app.to, spaceRootPath(spaceKey))}
          key={app.id}
          label={
            app.labelKey
              ? t(app.labelKey, { defaultValue: app.label })
              : app.label
          }
        />
      ))}
    </div>
  );
}

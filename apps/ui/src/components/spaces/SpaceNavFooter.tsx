/**
 * The space's Settings link, pinned to the foot of the sidebar column.
 *
 * Bottom-of-the-sidebar is where this application already puts Settings (the
 * rail's admin stack sits above the user menu the same way), so a space follows
 * the convention rather than inventing a place of its own.
 *
 * It is the way into everything the sidebar deliberately does NOT do: managing
 * who is in the space, what is mounted, and whether it is private. The Work tab
 * shows the roster read-only; changing it is administration and lives here.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import { Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { spaceSettingsPath } from "@/lib/space-routes";

// Keyed by the space KEY, not its id: the link now stays inside `/s/<key>/…`,
// so opening settings no longer leaves the space it configures.
export function SpaceNavFooter({ spaceKey }: { spaceKey: string | null }) {
  const { t } = useTranslation("common");
  const location = useLocation();

  if (!spaceKey) {
    return null;
  }

  const to = spaceSettingsPath(spaceKey);
  const active = location.pathname.startsWith(to);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        // Matches the Work list's row geometry so the column has one left edge
        // and one corner radius throughout.
        "flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm transition",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
      to={to}
    >
      <Settings aria-hidden className="size-4 shrink-0" />
      <span className="truncate">
        {t("navigation.settings", { defaultValue: "Settings" })}
      </span>
    </Link>
  );
}
